// Supabase Edge Function: authorize and open a 1:1 chat channel.
//
// M2 fix: channel creation must be gated server-side. This verifies that the
// caller and the peer share an event and that neither is banned, then creates
// the channel with the Stream *server* client and returns its id. The mobile
// client only watches the returned channel — it never creates channels itself.
//
// Lock this down fully by disabling the "create-channel" permission for the
// `user` role in the Stream dashboard, so a client token cannot bypass this
// function.
//
// Deploy:  supabase functions deploy open-channel
// (uses the same STREAM_API_KEY / STREAM_API_SECRET secrets as stream-token)

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { StreamChat } from "https://esm.sh/stream-chat@8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Peer must be visible (RLS hides banned/non-co-attendee rows).
    const { data: peer } = await supabase
      .from("users")
      .select("id")
      .eq("id", peerId)
      .maybeSingle();
    if (!peer) return json({ error: "Recipient not available" }, 403);

    // Create/fetch the distinct channel server-side.
    const apiKey = Deno.env.get("STREAM_API_KEY")!;
    const apiSecret = Deno.env.get("STREAM_API_SECRET")!;
    const server = StreamChat.getInstance(apiKey, apiSecret);

    const members = [user.id, peerId].sort();
    const channel = server.channel("messaging", {
      members,
      created_by_id: user.id,
    });
    await channel.create();

    return json({ channelId: channel.id, apiKey });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
