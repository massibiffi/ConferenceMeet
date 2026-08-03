import { encodeGeohash } from "@/lib/geohash";

describe("encodeGeohash", () => {
  it("matches the canonical reference vector", () => {
    // Well-known geohash test point: 57.64911, 10.40744 -> "u4pruydqqvj..."
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
  });

  it("encodes the origin", () => {
    expect(encodeGeohash(0, 0, 5)).toBe("s0000");
  });

  it("respects the requested precision (length)", () => {
    expect(encodeGeohash(48.8566, 2.3522, 5)).toHaveLength(5);
    expect(encodeGeohash(48.8566, 2.3522, 8)).toHaveLength(8);
  });

  it("is coarse: nearby points share the precision-5 prefix", () => {
    // Two points ~1km apart in Paris should land in the same ~5km cell.
    const a = encodeGeohash(48.8566, 2.3522, 5);
    const b = encodeGeohash(48.8606, 2.3522, 5);
    expect(a).toBe(b);
  });

  it("is deterministic", () => {
    expect(encodeGeohash(51.5074, -0.1278, 7)).toBe(encodeGeohash(51.5074, -0.1278, 7));
  });

  it("distinguishes far-apart points", () => {
    expect(encodeGeohash(48.8566, 2.3522, 5)).not.toBe(encodeGeohash(-33.8688, 151.2093, 5));
  });
});
