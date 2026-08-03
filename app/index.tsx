import { Redirect } from "expo-router";

// Entry point — the root layout redirects based on auth state, but we also
// send authenticated users straight to Discover.
export default function Index() {
  return <Redirect href="/(tabs)/discover" />;
}
