import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db";
import { applyFeedback, scoreAllSignatures } from "./engine/correlation";
import { emitAnomalyUpdated, emitFeedbackRecorded } from "./socket";
import { clearOpenAnomaly } from "./simulator";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/assets", async (_req, res) => {
  const assets = await prisma.asset.findMany({
    include: {
      anomalies: { where: { status: "open" }, orderBy: { detectedAt: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  res.json(
    assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      location: a.location,
      riskLevel: a.anomalies[0]?.riskLevel ?? "low",
      status: a.anomalies[0] ? "anomaly" : "normal",
      likelyCause: a.anomalies[0]?.likelyCause ?? null,
      confidence: a.anomalies[0] ? Number(a.anomalies[0].confidence) : null,
      openAnomalyId: a.anomalies[0]?.id ?? null,
    }))
  );
});

router.get("/assets/:id", async (req, res) => {
  const id = Number(req.params.id);
  const asset = await prisma.asset.findUnique({ where: { id }, include: { sensors: true } });
  if (!asset) {
    res.status(404).json({ error: { code: "not_found", message: "Asset not found" } });
    return;
  }
  res.json(asset);
});

router.get("/anomalies", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const anomalies = await prisma.anomaly.findMany({
    where: status ? { status } : undefined,
    include: { evidence: true, asset: true },
    orderBy: { detectedAt: "desc" },
  });
  res.json(anomalies);
});

router.get("/anomalies/:id", async (req, res) => {
  const id = Number(req.params.id);
  const anomaly = await prisma.anomaly.findUnique({
    where: { id },
    include: { evidence: true, asset: true, feedback: true },
  });
  if (!anomaly) {
    res.status(404).json({ error: { code: "not_found", message: "Anomaly not found" } });
    return;
  }

  // Live-recomputed rather than persisted (see scoreAllSignatures) — reflects the
  // current pattern_weight and telemetry, so a page reload after feedback (or after
  // more time has passed) shows the adjusted score. Always rank by current confidence
  // so "primary" never scores below "alternative" — the persisted likely_cause/confidence
  // on the anomaly row stay as the detection-time snapshot used by the History view.
  const candidates = await scoreAllSignatures(anomaly.assetId);
  const [primary, alternative] = candidates;

  res.json({ ...anomaly, diagnosis: { primary, alternative } });
});

const feedbackSchema = z.object({
  verdict: z.enum(["correct", "wrong", "snoozed"]),
  actualCause: z.string().max(200).optional(),
});

router.post("/anomalies/:id/feedback", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "invalid_body", message: parsed.error.message } });
    return;
  }

  const anomaly = await prisma.anomaly.findUnique({ where: { id } });
  if (!anomaly) {
    res.status(404).json({ error: { code: "not_found", message: "Anomaly not found" } });
    return;
  }

  const { verdict, actualCause } = parsed.data;

  const feedback = await prisma.feedback.create({
    data: { anomalyId: id, engineerVerdict: verdict, actualCause: actualCause ?? null },
  });

  const reweight = await applyFeedback(anomaly.assetId, anomaly.likelyCause, verdict);

  const newStatus = verdict === "snoozed" ? "snoozed" : "resolved";
  const updated = await prisma.anomaly.update({
    where: { id },
    data: { status: newStatus },
    include: { evidence: true, asset: true },
  });

  clearOpenAnomaly(anomaly.assetId);

  emitFeedbackRecorded({
    anomalyId: id,
    verdict,
    patternWeight: reweight.weight,
    correctionCount: reweight.correctionCount,
  });
  emitAnomalyUpdated(updated);

  res.json({ feedback, patternWeight: reweight.weight, correctionCount: reweight.correctionCount });
});

router.get("/assets/:id/history/:pattern", async (req, res) => {
  const assetId = Number(req.params.id);
  const pattern = req.params.pattern;

  const anomalies = await prisma.anomaly.findMany({
    where: { assetId, likelyCause: { equals: pattern, mode: "insensitive" } },
    include: { feedback: true },
    orderBy: { detectedAt: "asc" },
  });

  res.json(
    anomalies.map((a) => ({
      detectedAt: a.detectedAt,
      confidence: Number(a.confidence),
      verdicts: a.feedback.map((f) => f.engineerVerdict),
    }))
  );
});
