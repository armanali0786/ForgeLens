import { prisma } from "./db";
import { detectAnomaly } from "./engine/detection";
import { diagnose } from "./engine/correlation";
import { buildNarrative } from "./engine/explain";
import { emitAnomalyNew } from "./socket";

export const SENSOR_DEFS = [
  { name: "supply_air_temp", unit: "°F", min: 55, max: 65, baseline: 60, noise: 0.6 },
  { name: "valve_command", unit: "%", min: 20, max: 60, baseline: 40, noise: 1.5 },
  { name: "cooling_output", unit: "%", min: 40, max: 80, baseline: 60, noise: 1.5 },
  { name: "fan_load", unit: "%", min: 40, max: 70, baseline: 55, noise: 1.2 },
  { name: "static_pressure", unit: "inWC", min: 0.8, max: 1.4, baseline: 1.1, noise: 0.03 },
];

type ScenarioName = "valve_degradation" | "fan_fault" | "filter_clog";

interface Scenario {
  rampTicks: number;
  drift: Record<string, number>;
}

const SCENARIOS: Record<ScenarioName, Scenario> = {
  valve_degradation: {
    rampTicks: 90,
    drift: { valve_command: 95, cooling_output: 25, supply_air_temp: 74 },
  },
  fan_fault: {
    rampTicks: 60,
    drift: { fan_load: 15, static_pressure: 0.3, supply_air_temp: 72 },
  },
  filter_clog: {
    rampTicks: 120,
    drift: { static_pressure: 2.6, fan_load: 85, supply_air_temp: 70 },
  },
};

// Deliberately scripted rather than random, so every failure mode is reliably
// demoable within a short session instead of left to chance (see README §3).
const ASSET_PLAN: { name: string; scenario: ScenarioName | null; startTick: number }[] = [
  { name: "AHU-01", scenario: null, startTick: 0 },
  { name: "AHU-02", scenario: null, startTick: 0 },
  { name: "AHU-03", scenario: "filter_clog", startTick: 20 },
  { name: "AHU-04", scenario: "valve_degradation", startTick: 10 },
  { name: "AHU-05", scenario: "fan_fault", startTick: 35 },
];

const TICK_MS = 4000;
const WINDOW_SIZE = 8;

let tick = 0;
const recentWindows = new Map<string, number[]>();
const openAnomalyByAsset = new Map<number, string>();

function gaussianNoise(scale: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * scale;
}

function scenarioValue(baseline: number, target: number, progress: number, noise: number): number {
  const eased = Math.min(1, Math.max(0, progress));
  return baseline + (target - baseline) * eased + gaussianNoise(noise);
}

export function clearOpenAnomaly(assetId: number) {
  openAnomalyByAsset.delete(assetId);
}

export async function startSimulator() {
  const assets = await prisma.asset.findMany({ include: { sensors: true } });
  if (assets.length === 0) {
    console.warn("[simulator] no assets found — run `npm run db:seed` first");
    return;
  }

  // openAnomalyByAsset only lives in memory, so a process restart while an anomaly
  // is still unresolved would otherwise let the next tick raise a duplicate for the
  // same ongoing condition. Seed it from the DB so a restart can't do that.
  const openAnomalies = await prisma.anomaly.findMany({ where: { status: "open" } });
  for (const anomaly of openAnomalies) {
    openAnomalyByAsset.set(anomaly.assetId, anomaly.likelyCause);
  }
  if (openAnomalies.length > 0) {
    console.log(`[simulator] resuming with ${openAnomalies.length} already-open anomalies`);
  }

  console.log(`[simulator] running for ${assets.length} assets, tick=${TICK_MS}ms`);

  setInterval(() => {
    tick += 1;
    for (const asset of assets) {
      void processAssetTick(asset);
    }
  }, TICK_MS);
}

async function processAssetTick(asset: { id: number; name: string; sensors: { id: number; name: string; normalRangeMin: unknown; normalRangeMax: unknown }[] }) {
  const plan = ASSET_PLAN.find((p) => p.name === asset.name);
  const scenario = plan?.scenario && tick >= plan.startTick ? SCENARIOS[plan.scenario] : null;
  const progress = scenario ? (tick - plan!.startTick) / scenario.rampTicks : 0;

  for (const sensor of asset.sensors) {
    const def = SENSOR_DEFS.find((d) => d.name === sensor.name);
    if (!def) continue;

    const driftTarget = scenario?.drift[sensor.name];
    const value =
      driftTarget !== undefined
        ? scenarioValue(def.baseline, driftTarget, progress, def.noise)
        : def.baseline + gaussianNoise(def.noise);

    await prisma.telemetry.create({ data: { sensorId: sensor.id, value } });

    const key = `${asset.id}:${sensor.name}`;
    const window = recentWindows.get(key) ?? [];

    const result = detectAnomaly({
      currentValue: value,
      normalMin: Number(sensor.normalRangeMin),
      normalMax: Number(sensor.normalRangeMax),
      windowValues: window,
    });

    window.push(value);
    if (window.length > WINDOW_SIZE) window.shift();
    recentWindows.set(key, window);

    if (result.flag && !openAnomalyByAsset.has(asset.id)) {
      await raiseAnomaly(asset.id, sensor.name, result.flag);
    }
  }
}

async function raiseAnomaly(assetId: number, triggerSignal: string, flag: "out_of_range" | "rapid_change") {
  const diagnosis = await diagnose(assetId, triggerSignal, flag);
  openAnomalyByAsset.set(assetId, diagnosis.primary.patternName);

  // Rephrases the diagnosis already computed above — never decides it. Falls back
  // to the deterministic template instantly if LLM_API_KEY/LLM_PROVIDER aren't set,
  // or within GROQ_TIMEOUT_MS if the call fails (see explain.ts).
  const narrative = await buildNarrative(diagnosis);

  const anomaly = await prisma.anomaly.create({
    data: {
      assetId,
      riskLevel: diagnosis.riskLevel,
      likelyCause: diagnosis.primary.label,
      confidence: diagnosis.primary.confidence,
      status: "open",
      narrative,
      evidence: {
        create: diagnosis.primary.evidence.map((e) => ({
          signalName: e.signalName,
          changeDescription: e.changeDescription,
          weight: e.weight,
        })),
      },
    },
    include: { evidence: true, asset: true },
  });

  console.log(`[simulator] anomaly raised: ${anomaly.asset.name} -> ${anomaly.likelyCause} (${Math.round(diagnosis.primary.confidence * 100)}%)`);

  emitAnomalyNew({ anomaly, diagnosis, narrative });
}
