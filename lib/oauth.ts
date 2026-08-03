// LinkedIn sign-in via Supabase OAuth (PKCE) + an in-app browser session.
//
// LinkedIn is our strongest cheap identity signal: after a successful sign-in we
// call the `mark_linkedin_verified` RPC, which raises the user's badge to
// "linkedin" (it can't be self-assigned — the DB trigger enforces that).
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "./supabase";

// Finishes any auth session that was pending when the app was backgrounded.
WebBrowser.maybeCompleteAuthSession();

export async function signInWithLinkedIn(): Promise<{ error?: string }> {
  const redirectTo = makeRedirectUri({ scheme: "conferencemeet", path: "auth-callback" });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "linkedin_oidc",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return { error: error.message };
  if (!data?.url) return { error: "Couldn't start LinkedIn sign-in." };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") {
    return { error: result.type === "cancel" ? "Sign-in cancelled." : "Sign-in failed." };
  }

  // The redirect carries an authorization code (PKCE). Exchange it for a session.
  const returned = result.url;
  const query = returned.includes("#")
    ? returned.substring(returned.indexOf("#") + 1)
    : returned.substring(returned.indexOf("?") + 1);
  const params = new URLSearchParams(query);
  const code = params.get("code");

  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) return { error: exErr.message };
  } else {
    // Fallback: some configs return tokens directly.
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sErr) return { error: sErr.message };
    } else {
      return { error: "No authorization code returned." };
    }
  }

  // Best-effort badge bump; ignore failure (auth already succeeded).
  await supabase.rpc("mark_linkedin_verified");
  return {};
}
