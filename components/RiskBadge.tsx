import type { RiskLevel } from "../lib/types";

const LABEL: Record<RiskLevel, string> = {
  low: "Normal",
  medium: "Watch",
  high: "Critical",
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className="risk-badge" data-risk={risk}>
      <span className="risk-dot" data-risk={risk} aria-hidden="true" />
      {LABEL[risk]}
    </span>
  );
}

export function RiskDot({ risk }: { risk: RiskLevel }) {
  return <span className="risk-dot" data-risk={risk} aria-hidden="true" title={LABEL[risk]} />;
}
