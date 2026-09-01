// Supabase Edge Function: mint a Stream Chat user token.
//
// The Stream API SECRET must never ship in the mobile app — it lives here as a
// function secret. The app calls this endpoint with its Supabase session; we
// verify the user, upsert them into Stream, and return a short-lived token plus
// the (public) Stream API key.
//
// NOTE: this deliberately does NOT use the `stream-chat` npm/esm SDK. That
// package pulls in `ws`, which has optional native dependencies (bufferutil,
// utf-8-validate) that Deno's runtime (both via esm.sh and the npm: specifier)
// fails to resolve, crashing the function at import time. Everything this
// function needs — signing a JWT and calling Stream's REST API — is simple
// enough to do directly with Deno's built-in Web Crypto and fetch(), with no
// external dependency on Stream's side at all.
//
// Deploy:
//   supabase functions deploy stream-token
// Secrets:
//   supabase secrets set STREAM_API_KEY=xxx STREAM_API_SECRET=yyy
// (SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.)

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
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Verify the caller against Supabase auth using their own JWT.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    // Pull display fields from the profile row (best-effort).
    const { data: profile } = await supabase
      .from("users")
      .select("name, photo_url, is_banned")
      .eq("id", user.id)
      .maybeSingle();

    // M2: banned users must not be issued chat tokens.
    if (profile?.is_banned) {
      return json({ error: "Account suspended" }, 403);
    }

    const apiKey = Deno.env.get("STREAM_API_KEY")!;
    const apiSecret = Deno.env.get("STREAM_API_SECRET")!;

    // Upsert the user into Stream via the REST API, authenticated with a
    // server token (no user_id claim - server tokens act on behalf of the app).
    const serverToken = await createStreamToken(apiSecret, {});
    const upsertRes = await fetch(
      `${STREAM_BASE_URL}/users?api_key=${apiKey}`,
      {
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
              name: profile?.name || user.email || "Attendee",
              image: profile?.photo_url ?? undefined,
            },
          },
        }),
      }
    );
    if (!upsertRes.ok) {
      const body = await upsertRes.text();
      return json({ error: `Stream upsertUser failed: ${body}` }, 502);
    }

    // The token returned to the client MUST include the user_id claim.
    const token = await createStreamToken(apiSecret, { user_id: user.id });

    return json({ token, apiKey, userId: user.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/**
 * Signs a Stream Chat JWT. Stream tokens are plain HS256 JWTs signed with the
 * API secret - client-facing tokens carry a `user_id` claim, server tokens
 * carry no claims (an empty payload object).
 */
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
