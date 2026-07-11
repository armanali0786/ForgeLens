import { prisma } from "../db";
import { FAILURE_SIGNATURES, type FailureSignature, slugify } from "./signatures";
import type {
  CandidateCause,
  DetectionFlag,
  DiagnosisResult,
  Direction,
  EvidenceItem,
  RiskLevel,
} from "./types";

const FLAT_THRESHOLD = 0.05;
const MIN_CONFIDENCE = 0.05;
const MAX_CONFIDENCE = 0.97;
const HIGH_RISK_THRESHOLD = 0.65;
const MEDIUM_RISK_THRESHOLD = 0.35;
const CORRECT_NUDGE = 0.08;
const WRONG_NUDGE = 0.15;
const MIN_PATTERN_WEIGHT = 0.2;
const MAX_PATTERN_WEIGHT = 1.5;

type SensorSeries = Record<string, number[]>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function classifyDirection(values: number[]): { direction: Direction; pctChange: number } {
  if (values.length < 2) return { direction: "flat", pctChange: 0 };

  const segmentSize = Math.max(1, Math.floor(values.length / 3));
  const earlyAvg = average(values.slice(0, segmentSize));
  const lateAvg = average(values.slice(-segmentSize));

  if (earlyAvg === 0) return { direction: "flat", pctChange: 0 };

  const pctChange = (lateAvg - earlyAvg) / Math.abs(earlyAvg);
  if (Math.abs(pctChange) < FLAT_THRESHOLD) return { direction: "flat", pctChange };
  return { direction: pctChange > 0 ? "up" : "down", pctChange };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function describeChange(sensorName: string, direction: Direction, pctChange: number): string {
  const label = sensorName.replace(/_/g, " ");
  const pct = Math.round(Math.abs(pctChange) * 100);
  if (direction === "flat") return `${label} stable (±${pct}% over 24h)`;
  return `${label} ${direction} ${pct}% over the last 24h`;
}

async function loadRecentSeries(assetId: number, sensorNames: string[], hours = 24): Promise<SensorSeries> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const sensors = await prisma.sensor.findMany({
    where: { assetId, name: { in: sensorNames } },
  });

  const series: SensorSeries = {};
  for (const sensor of sensors) {
    const rows = await prisma.telemetry.findMany({
      where: { sensorId: sensor.id, recordedAt: { gte: since } },
      orderBy: { recordedAt: "asc" },
      select: { value: true },
    });
    series[sensor.name] = rows.map((r) => Number(r.value));
  }
  return series;
}

async function getPatternWeight(assetId: number, patternName: string) {
  const existing = await prisma.patternWeight.findUnique({
    where: { assetId_patternName: { assetId, patternName } },
  });
  if (existing) return { weight: Number(existing.weight), correctionCount: existing.correctionCount };
  return { weight: 1.0, correctionCount: 0 };
}

async function scoreSignature(
  assetId: number,
  sig: FailureSignature,
  series: SensorSeries
): Promise<CandidateCause> {
  const { weight: patternWeight, correctionCount } = await getPatternWeight(assetId, sig.name);

  let baseScore = 0;
  const evidence: EvidenceItem[] = sig.signals.map((signal) => {
    const values = series[signal.sensor] ?? [];
    const { direction, pctChange } = classifyDirection(values);
    const matched = direction === signal.direction;
    if (matched) baseScore += signal.weight;

    return {
      signalName: signal.sensor,
      direction,
      pctChange,
      changeDescription: describeChange(signal.sensor, direction, pctChange),
      weight: signal.weight,
      matched,
    };
  });

  const confidence = clamp(baseScore * patternWeight, MIN_CONFIDENCE, MAX_CONFIDENCE);

  return {
    patternName: sig.name,
    label: sig.label,
    confidence,
    baseScore,
    patternWeight,
    correctionCount,
    evidence,
    actionPlan: sig.actionPlan,
    etaToFailureHours: sig.etaToFailureHours,
  };
}

function riskFromConfidence(confidence: number): RiskLevel {
  if (confidence > HIGH_RISK_THRESHOLD) return "high";
  if (confidence > MEDIUM_RISK_THRESHOLD) return "medium";
  return "low";
}

export async function diagnose(
  assetId: number,
  triggerSignal: string,
  triggerFlag: DetectionFlag
): Promise<DiagnosisResult> {
  const candidates = await scoreAllSignatures(assetId);
  const [primary, alternative] = candidates;

  return {
    assetId,
    triggerSignal,
    triggerFlag,
    riskLevel: riskFromConfidence(primary.confidence),
    primary,
    alternative: alternative ?? null,
  };
}

/**
 * Scores every failure signature against an asset's current telemetry + pattern_weight
 * state. Nothing here is persisted beyond the anomaly's stored likely_cause/confidence —
 * it's cheap and deterministic enough to recompute on read, so the API can serve a live
 * evidence/alternative-hypothesis view instead of freezing it at detection time.
 */
export async function scoreAllSignatures(assetId: number): Promise<CandidateCause[]> {
  const sensorNames = Array.from(new Set(FAILURE_SIGNATURES.flatMap((s) => s.signals.map((x) => x.sensor))));
  const series = await loadRecentSeries(assetId, sensorNames);

  const candidates = await Promise.all(FAILURE_SIGNATURES.map((sig) => scoreSignature(assetId, sig, series)));
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}

export async function applyFeedback(
  assetId: number,
  likelyCauseLabel: string,
  verdict: "correct" | "wrong" | "snoozed"
) {
  const patternName = slugify(likelyCauseLabel);
  const existing = await prisma.patternWeight.findUnique({
    where: { assetId_patternName: { assetId, patternName } },
  });

  const currentWeight = existing ? Number(existing.weight) : 1.0;
  const currentCount = existing?.correctionCount ?? 0;

  let nextWeight = currentWeight;
  if (verdict === "correct") nextWeight = clamp(currentWeight + CORRECT_NUDGE, MIN_PATTERN_WEIGHT, MAX_PATTERN_WEIGHT);
  if (verdict === "wrong") nextWeight = clamp(currentWeight - WRONG_NUDGE, MIN_PATTERN_WEIGHT, MAX_PATTERN_WEIGHT);
  const nextCount = currentCount + (verdict === "snoozed" ? 0 : 1);

  await prisma.patternWeight.upsert({
    where: { assetId_patternName: { assetId, patternName } },
    update: { weight: nextWeight, correctionCount: nextCount },
    create: { assetId, patternName, weight: nextWeight, correctionCount: nextCount },
  });

  return { patternName, weight: nextWeight, correctionCount: nextCount };
}
