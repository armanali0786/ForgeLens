import { describe, expect, it } from "vitest";
import { detectAnomaly } from "../engine/detection";

describe("detectAnomaly", () => {
  it("flags a value above the normal range as out_of_range", () => {
    const result = detectAnomaly({ currentValue: 70, normalMin: 55, normalMax: 65, windowValues: [60, 61, 59] });
    expect(result.flag).toBe("out_of_range");
  });

  it("flags a value below the normal range as out_of_range", () => {
    const result = detectAnomaly({ currentValue: 50, normalMin: 55, normalMax: 65, windowValues: [60, 61, 59] });
    expect(result.flag).toBe("out_of_range");
  });

  it("does not flag a value exactly on the boundary", () => {
    const result = detectAnomaly({ currentValue: 65, normalMin: 55, normalMax: 65, windowValues: [60, 61, 62] });
    expect(result.flag).toBeNull();
  });

  it("flags a rapid change within the normal band", () => {
    const result = detectAnomaly({ currentValue: 63, normalMin: 55, normalMax: 65, windowValues: [55, 55, 55, 55] });
    expect(result.flag).toBe("rapid_change");
  });

  it("does not flag a rapid change with too small a window", () => {
    const result = detectAnomaly({ currentValue: 63, normalMin: 55, normalMax: 65, windowValues: [55] });
    expect(result.flag).toBeNull();
  });

  it("does not flag ordinary noise within the window", () => {
    const result = detectAnomaly({ currentValue: 60.5, normalMin: 55, normalMax: 65, windowValues: [60, 59.8, 60.2, 60.1] });
    expect(result.flag).toBeNull();
  });
});
