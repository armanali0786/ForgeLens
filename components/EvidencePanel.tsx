import type { Direction } from "../lib/types";

interface EvidenceRow {
  signalName: string;
  direction: Direction;
  changeDescription: string;
  weight: number;
  matched: boolean;
}

export function EvidencePanel({ evidence }: { evidence: EvidenceRow[] }) {
  return (
    <div className="panel">
      <h2>Why do you think this?</h2>
      {evidence.map((e) => (
        <div className="evidence-row" key={e.signalName}>
          <span className="evidence-label">{e.signalName.replace(/_/g, " ")}</span>
          <span className="evidence-track">
            <span
              className="evidence-fill"
              data-matched={e.matched}
              style={{ width: `${Math.round(e.weight * 100)}%` }}
            />
          </span>
          <span className="evidence-value mono" data-direction={e.direction}>
            {e.changeDescription.match(/[\d.]+%/)?.[0] ?? "±0%"}
          </span>
        </div>
      ))}
    </div>
  );
}
