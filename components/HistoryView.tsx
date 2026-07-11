"use client";

import { useQuery } from "@tanstack/react-query";
import { getHistory } from "../lib/api";

const VERDICT_MARK: Record<string, { symbol: string; className: string }> = {
  correct: { symbol: "✓", className: "verdict-correct" },
  wrong: { symbol: "✗", className: "verdict-wrong" },
  snoozed: { symbol: "⏸", className: "verdict-snoozed" },
};

export function HistoryView({ assetId, pattern }: { assetId: number; pattern: string }) {
  const { data } = useQuery({
    queryKey: ["history", assetId, pattern],
    queryFn: () => getHistory(assetId, pattern),
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="panel">
      <h2>History · {pattern}</h2>
      {data.map((point, i) => (
        <div className="history-row" key={`${point.detectedAt}-${i}`}>
          <span className="mono">{new Date(point.detectedAt).toLocaleString()}</span>
          <span className="mono">{Math.round(point.confidence * 100)}%</span>
          {point.verdicts.map((v, j) => {
            const mark = VERDICT_MARK[v];
            return (
              <span key={j} className={mark?.className}>
                {mark?.symbol}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
