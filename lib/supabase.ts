import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev — the app can't do anything without these.
  throw new Error(
    "Missing Supabase env vars. Copy .env.example to .env and fill in " +
      "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

// The client is intentionally left untyped at the generic level: we rely on the
// explicit domain types in `lib/types.ts` when reading query results. To get full
// end-to-end DB typing later, generate types with the Supabase CLI and pass them
// as `createClient<Database>(...)`.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce", // required for the LinkedIn OAuth code exchange
  },
});
