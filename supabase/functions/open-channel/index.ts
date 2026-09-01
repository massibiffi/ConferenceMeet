// Supabase Edge Function: authorize and open a 1:1 chat channel.
//
// M2 fix: channel creation must be gated server-side. This verifies that the
// caller and the peer share an event, have an ACCEPTED connection, and that
// neither is banned, then creates the channel via Stream's REST API (using a
// server token) and returns its id. The mobile client only watches the
// returned channel — it never creates channels itself.
//
// Lock this down fully by disabling the "create-channel" permission for the
// `user` role in the Stream dashboard, so a client token cannot bypass this
// function.
//
// NOTE: this deliberately does NOT use the `stream-chat` npm/esm SDK - see the
// comment in stream-token/index.ts for why. Channel creation here is a plain
// REST call, signed with the same JWT approach as the token function.
//
// Deploy:  supabase functions deploy open-channel
// (uses the same STREAM_API_KEY / STREAM_API_SECRET secrets as stream-token)

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STREAM_BASE_URL = "https://chat.stream-io-api.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const { peerId } = await req.json().catch(() => ({}));
    if (!peerId || typeof peerId !== "string") {
      return json({ error: "peerId required" }, 400);
    }
    if (peerId === user.id) return json({ error: "Cannot chat with yourself" }, 400);

    // Caller must not be banned.
    const { data: me } = await supabase
      .from("users")
      .select("is_banned")
      .eq("id", user.id)
      .maybeSingle();
    if (!me || me.is_banned) return json({ error: "Account suspended" }, 403);

    // Caller and peer must share an event (shares_event_with is SECURITY DEFINER
    // and evaluates for the authenticated caller).
    const { data: shares, error: sharesErr } = await supabase.rpc(
      "shares_event_with",
      { target: peerId }
    );
    if (sharesErr) return json({ error: sharesErr.message }, 500);
    if (!shares) return json({ error: "You don't share an event with this person" }, 403);

    // Caller and peer must have an ACCEPTED connection. Chat is not open to
    // any co-attendee — connecting only happens via a swipe-left "like" on
    // Discover, which upserts status directly to "accepted".
    const { data: connection, error: connErr } = await supabase
      .from("connections")
      .select("status")
      .or(
        `and(requester_id.eq.${user.id},recipient_id.eq.${peerId}),and(requester_id.eq.${peerId},recipient_id.eq.${user.id})`
      )
      .maybeSingle();
    if (connErr) return json({ error: connErr.message }, 500);
    if (!connection || connection.status !== "accepted") {
      return json({ error: "You must be connected with this person to chat" }, 403);
    }

    // Peer must be visible (RLS hides banned/non-co-attendee rows).
    const { data: peer } = await supabase
      .from("users")
      .select("id, name, photo_url")
      .eq("id", peerId)
      .maybeSingle();
    if (!peer) return json({ error: "Recipient not available" }, 403);

    const apiKey = Deno.env.get("STREAM_API_KEY")!;
    const apiSecret = Deno.env.get("STREAM_API_SECRET")!;
    const serverToken = await createStreamToken(apiSecret, {});

    // Both members must exist as Stream users before a channel can be created
    // with them. The caller gets upserted by stream-token when they connect,
    // but the peer may never have opened the app (e.g. seeded/fake profiles),
    // so upsert both here to be safe.
    const { data: caller } = await supabase
      .from("users")
      .select("name, photo_url")
      .eq("id", user.id)
      .maybeSingle();

    const upsertRes = await fetch(`${STREAM_BASE_URL}/users?api_key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stream-Auth-Type": "jwt",
        Authorization: serverToken,
      },
      body: JSON.stringify({
        users: {
          [user.id]: {
            id: user.id,
            name: caller?.name || "Attendee",
            image: caller?.photo_url ?? undefined,
          },
          [peerId]: {
            id: peerId,
            name: peer.name || "Attendee",
            image: peer.photo_url ?? undefined,
          },
        },
      }),
    });
    if (!upsertRes.ok) {
      const body = await upsertRes.text();
      return json({ error: `Stream upsertUser (open-channel) failed: ${body}` }, 502);
    }

    const members = [user.id, peerId].sort();
    const channelId = await distinctChannelId(members);

    const channelRes = await fetch(
      `${STREAM_BASE_URL}/channels/messaging/${channelId}/query?api_key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stream-Auth-Type": "jwt",
          Authorization: serverToken,
        },
        body: JSON.stringify({
          data: { members, created_by_id: user.id },
          watch: false,
          state: false,
          presence: false,
        }),
      }
    );
    if (!channelRes.ok) {
      const body = await channelRes.text();
      return json({ error: `Stream channel create failed: ${body}` }, 502);
    }

    return json({ channelId, apiKey });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/**
 * Deterministic, short, Stream-safe channel id for a 1:1 pair, derived from
 * the sorted member ids. Using our own id (rather than Stream's built-in
 * "distinct channel" auto-id behavior, which is awkward to trigger via plain
 * REST) keeps this simple and guarantees the same two users always land on
 * the same channel regardless of who opens it first.
 */
async function distinctChannelId(members: string[]): Promise<string> {
  const sorted = [...members].sort();
  const encoder = new TextEncoder();
  const data = encoder.encode(sorted.join(":"));
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `dm-${hex.slice(0, 40)}`;
}

/** Same JWT signing approach as stream-token/index.ts. */
async function createStreamToken(
  secret: string,
  payload: Record<string, unknown>
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput)
  );
  const sigB64 = base64UrlEncode(new Uint8Array(signature));

  return `${signingInput}.${sigB64}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
