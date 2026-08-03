import { weightedPick } from "@/lib/sponsors";
import type { Sponsor } from "@/lib/types";

function sponsor(id: string, weight: number): Sponsor {
  return {
    id,
    event_id: "e1",
    name: id,
    logo_url: null,
    tagline: null,
    link_url: null,
    weight,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("weightedPick", () => {
  it("returns null for an empty list", () => {
    expect(weightedPick([])).toBeNull();
  });

  it("returns the only sponsor when there is one", () => {
    const a = sponsor("a", 1);
    expect(weightedPick([a], () => 0.5)).toBe(a);
  });

  it("picks by weight (rng at start hits the first)", () => {
    const a = sponsor("a", 1);
    const b = sponsor("b", 3);
    // total weight = 4; rng()=0 -> r=0 -> first bucket (a)
    expect(weightedPick([a, b], () => 0)?.id).toBe("a");
  });

  it("picks by weight (rng in the heavy bucket hits the second)", () => {
    const a = sponsor("a", 1);
    const b = sponsor("b", 3);
    // total = 4; rng()=0.5 -> r=2 -> past a (weight 1) into b (weight 3)
    expect(weightedPick([a, b], () => 0.5)?.id).toBe("b");
  });

  it("treats weight < 1 as 1", () => {
    const a = sponsor("a", 0);
    const b = sponsor("b", 0);
    // both effectively weight 1; rng()=0.9 -> r=1.8 -> past a into b
    expect(weightedPick([a, b], () => 0.9)?.id).toBe("b");
  });

  it("is statistically weighted over many draws", () => {
    const a = sponsor("a", 1);
    const b = sponsor("b", 9); // b should win ~90%
    let bCount = 0;
    for (let i = 0; i < 1000; i++) {
      // deterministic-ish rng cycling through [0,1)
      const r = (i * 0.6180339887) % 1;
      if (weightedPick([a, b], () => r)?.id === "b") bCount++;
    }
    expect(bCount).toBeGreaterThan(800);
  });
});
