// Opt-in, coarse, ephemeral location helper.
// Design constraints from the MVP plan (hard requirements, not preferences):
//   - foreground permission only
//   - low accuracy; we NEVER send precise lat/long to the server
//   - we store only a low-precision geohash (~1km cell) + optional zone label
//   - sharing carries an explicit expiry; the row is deleted when sharing stops
import * as Location from "expo-location";
import { supabase } from "./supabase";
import { encodeGeohash } from "./geohash";

export { encodeGeohash };

/** Ask permission (foreground only) and return whether we may read location. */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

/**
 * Turn coarse sharing ON for a bounded window. Reads one low-accuracy fix,
 * reduces it to a geohash, and upserts a single row with an expiry.
 */
export async function startSharing(opts: {
  eventId: string;
  zoneLabel?: string;
  hours?: number;
}): Promise<{ error?: string }> {
  const granted = await requestLocationPermission();
  if (!granted) return { error: "Location permission denied" };

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low, // coarse on purpose
  });
  const approxArea = encodeGeohash(pos.coords.latitude, pos.coords.longitude);
  const expires = new Date(Date.now() + (opts.hours ?? 2) * 3600_000).toISOString();

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { error: "Not signed in" };

  const { error } = await supabase.from("user_locations").upsert({
    user_id: uid,
    event_id: opts.eventId,
    zone_label: opts.zoneLabel ?? null,
    approx_area: approxArea,
    sharing_expires_at: expires,
    updated_at: new Date().toISOString(),
  } as never);
  return { error: error?.message };
}

/** Instant kill switch — hard-delete the row so nothing lingers server-side. */
export async function stopSharing(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return;
  await supabase.from("user_locations").delete().eq("user_id", uid);
}
