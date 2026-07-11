import type { Direction } from "./types";

export interface SignalSignature {
  sensor: string;
  direction: Direction;
  weight: number;
}

export interface FailureSignature {
  name: string;
  label: string;
  signals: SignalSignature[];
  actionPlan: string[];
  etaToFailureHours: [number, number];
}

// Each `label`, when slugified (lowercased, non-alphanumeric -> "_"), must equal
// its `name` — routes.ts derives the pattern_weight key from the stored likely_cause
// label rather than adding a redundant column, so the two have to stay in lockstep.
export const FAILURE_SIGNATURES: FailureSignature[] = [
  {
    name: "valve_degradation",
    label: "Valve degradation",
    signals: [
      { sensor: "valve_command", direction: "up", weight: 0.4 },
      { sensor: "cooling_output", direction: "down", weight: 0.4 },
      { sensor: "fan_load", direction: "flat", weight: 0.2 },
    ],
    actionPlan: [
      "Inspect the chilled water valve actuator for mechanical binding",
      "Verify the valve command signal is actually reaching the actuator",
      "Check the cooling coil for fouling that would reduce heat transfer",
    ],
    etaToFailureHours: [48, 96],
  },
  {
    name: "fan_fault",
    label: "Fan fault",
    signals: [
      { sensor: "fan_load", direction: "down", weight: 0.5 },
      { sensor: "static_pressure", direction: "down", weight: 0.3 },
      { sensor: "valve_command", direction: "flat", weight: 0.2 },
    ],
    actionPlan: [
      "Inspect the supply fan belt for slippage or wear",
      "Check fan motor amperage against nameplate rating",
      "Verify fan bearings for excess vibration or noise",
    ],
    etaToFailureHours: [12, 36],
  },
  {
    name: "filter_clog",
    label: "Filter clog",
    signals: [
      { sensor: "static_pressure", direction: "up", weight: 0.5 },
      { sensor: "fan_load", direction: "up", weight: 0.3 },
      { sensor: "valve_command", direction: "flat", weight: 0.2 },
    ],
    actionPlan: [
      "Inspect and replace the supply air filter",
      "Check the static pressure sensor for calibration drift",
      "Verify duct dampers are not obstructed",
    ],
    etaToFailureHours: [24, 72],
  },
];

export function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
