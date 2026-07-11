import { describe, expect, it } from "vitest";
import { classifyDirection } from "../engine/correlation";
import { FAILURE_SIGNATURES, slugify } from "../engine/signatures";

describe("classifyDirection", () => {
  it("classifies a rising series as up", () => {
    const { direction } = classifyDirection([40, 41, 42, 60, 90, 95]);
    expect(direction).toBe("up");
  });

  it("classifies a falling series as down", () => {
    const { direction } = classifyDirection([60, 58, 55, 30, 16, 15]);
    expect(direction).toBe("down");
  });

  it("classifies a stable series as flat", () => {
    const { direction } = classifyDirection([55, 54.8, 55.2, 55.1, 54.9, 55]);
    expect(direction).toBe("flat");
  });

  it("treats too few points as flat", () => {
    const { direction, pctChange } = classifyDirection([50]);
    expect(direction).toBe("flat");
    expect(pctChange).toBe(0);
  });
});

describe("failure signatures", () => {
  it("keeps each signature's label slug in sync with its pattern name", () => {
    for (const sig of FAILURE_SIGNATURES) {
      expect(slugify(sig.label)).toBe(sig.name);
    }
  });

  it("weights every signature's signals to sum to 1.0", () => {
    for (const sig of FAILURE_SIGNATURES) {
      const total = sig.signals.reduce((sum, s) => sum + s.weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    }
  });
});
