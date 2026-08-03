// Supabase Edge Function: mint a Stream Chat user token.
//
// The Stream API SECRET must never ship in the mobile app — it lives here as a
// function secret. The app calls this endpoint with its Supabase session; we
// verify the user, upsert them into Stream, and return a short-lived token plus
// the (public) Stream API key.
//
// Deploy:
//   supabase functions deploy stream-token
// Secrets:
//   supabase secrets set STREAM_API_KEY=xxx STREAM_API_SECRET=yyy
// (SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.)
//
// Run this with the Supabase CLI / Deno runtime.

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
    const serverClient = StreamChat.getInstance(apiKey, apiSecret);

    await serverClient.upsertUser({
      id: user.id,
      name: profile?.name || user.email || "Attendee",
      image: profile?.photo_url ?? undefined,
    });

    const token = serverClient.createToken(user.id);

    return json({ token, apiKey, userId: user.id });
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
