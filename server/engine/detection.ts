import type { DetectionFlag } from "./types";

const RATE_OF_CHANGE_THRESHOLD = 0.12;
const MIN_WINDOW_FOR_RATE_CHECK = 3;

export interface DetectionInput {
  currentValue: number;
  normalMin: number;
  normalMax: number;
  /** preceding readings, oldest first, current value excluded */
  windowValues: number[];
}

export interface DetectionResult {
  flag: DetectionFlag | null;
  windowAverage: number | null;
  pctChangeFromWindow: number | null;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function detectAnomaly(input: DetectionInput): DetectionResult {
  const { currentValue, normalMin, normalMax, windowValues } = input;

  if (currentValue < normalMin || currentValue > normalMax) {
    return {
      flag: "out_of_range",
      windowAverage: windowValues.length ? average(windowValues) : null,
      pctChangeFromWindow: null,
    };
  }

  if (windowValues.length >= MIN_WINDOW_FOR_RATE_CHECK) {
    const windowAverage = average(windowValues);
    if (windowAverage !== 0) {
      const delta = (currentValue - windowAverage) / Math.abs(windowAverage);
      if (Math.abs(delta) > RATE_OF_CHANGE_THRESHOLD) {
        return { flag: "rapid_change", windowAverage, pctChangeFromWindow: delta };
      }
    }
  }

  return {
    flag: null,
    windowAverage: windowValues.length ? average(windowValues) : null,
    pctChangeFromWindow: null,
  };
}
