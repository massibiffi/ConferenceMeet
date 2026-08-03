// Pure geohash encoding — no React Native / Expo imports, so it's unit-testable
// in isolation. Used to reduce a precise GPS fix to a coarse (~5km at precision 5)
// cell before it ever leaves the device.

export const GEOHASH_PRECISION = 5;
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash encode. Precision 5 ≈ ~5km cell, 6 ≈ ~1km. */
export function encodeGeohash(lat: number, lon: number, precision = GEOHASH_PRECISION): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";
  let latMin = -90,
    latMax = 90,
    lonMin = -180,
    lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        idx = idx * 2 + 1;
        lonMin = mid;
      } else {
        idx = idx * 2;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        idx = idx * 2 + 1;
        latMin = mid;
      } else {
        idx = idx * 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
}
