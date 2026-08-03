// Pure sponsor-selection logic — no React Native imports, so unit-testable.
import type { Sponsor } from "./types";

/**
 * Weighted random pick: a sponsor with weight 3 is 3x as likely as one with
 * weight 1. Weights below 1 are treated as 1. Returns null for an empty list.
 * `rng` is injectable so tests can make the pick deterministic.
 */
export function weightedPick(
  list: Sponsor[],
  rng: () => number = Math.random
): Sponsor | null {
  if (!list.length) return null;
  const total = list.reduce((s, x) => s + Math.max(1, x.weight), 0);
  let r = rng() * total;
  for (const s of list) {
    r -= Math.max(1, s.weight);
    if (r <= 0) return s;
  }
  return list[list.length - 1];
}
