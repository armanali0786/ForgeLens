"use client";

import { useQuery } from "@tanstack/react-query";
import { getAnomaly } from "../lib/api";
import { RiskBadge } from "./RiskBadge";
import { EvidencePanel } from "./EvidencePanel";
import { ActionPlan } from "./ActionPlan";
import { FeedbackControl } from "./FeedbackControl";
import { HistoryView } from "./HistoryView";

export function AlertDetail({ assetName, anomalyId }: { assetName: string; anomalyId: number }) {
  const { data: anomaly, isLoading } = useQuery({
    queryKey: ["anomaly", anomalyId],
    queryFn: () => getAnomaly(anomalyId),
  });

  if (isLoading || !anomaly) {
    return (
      <div className="empty-state">
        <p>Loading anomaly detail…</p>
      </div>
    );
  }

  const primary = anomaly.diagnosis?.primary;
  const alternative = anomaly.diagnosis?.alternative;
  const causeName = primary?.label ?? anomaly.likelyCause;
  const confidencePct = Math.round((primary?.confidence ?? Number(anomaly.confidence)) * 100);

  return (
    <div>
      <div className="alert-header">
        <h1>
          {assetName} · {causeName}
        </h1>
        <RiskBadge risk={anomaly.riskLevel} />
        <span className="timestamp mono">detected {new Date(anomaly.detectedAt).toLocaleString()}</span>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Likely Cause</h2>
          <div className="cause-name">{causeName}</div>
          <div className="confidence-row">
            <span className="confidence-meter">
              <span className="confidence-meter-fill" style={{ width: `${confidencePct}%` }} />
            </span>
            <span className="confidence-value mono">{confidencePct}%</span>
          </div>
          {alternative && (
            <div className="alt-hypothesis">
              Alt: {alternative.label} ({Math.round(alternative.confidence * 100)}%)
            </div>
          )}
          {primary && primary.correctionCount > 0 && (
            <div className="pattern-adjustment-badge">
              Adjusted · {primary.correctionCount} prior correction{primary.correctionCount === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {primary && <EvidencePanel evidence={primary.evidence} />}
      </div>

      <div className="grid-2" style={{ marginTop: "16px" }}>
        {primary && <ActionPlan steps={primary.actionPlan} etaHours={primary.etaToFailureHours} />}
        <FeedbackControl
          anomalyId={anomaly.id}
          assetId={anomaly.assetId}
          pattern={anomaly.likelyCause}
          existingVerdict={anomaly.feedback?.[0]?.engineerVerdict ?? null}
        />
      </div>

      <div style={{ marginTop: "16px" }}>
        <HistoryView assetId={anomaly.assetId} pattern={anomaly.likelyCause} />
      </div>
    </div>
  );
}
