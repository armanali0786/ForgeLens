import type { AssetSummary } from "../lib/types";
import { RiskDot } from "./RiskBadge";

export function AssetList({
  assets,
  selectedId,
  pulsingId,
  onSelect,
}: {
  assets: AssetSummary[];
  selectedId: number | null;
  pulsingId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <nav className="sidebar">
      <div className="sidebar-heading">Assets</div>
      {assets.map((asset) => (
        <button
          key={asset.id}
          className={`asset-item${pulsingId === asset.id ? " asset-item-pulse" : ""}`}
          data-active={selectedId === asset.id}
          onClick={() => onSelect(asset.id)}
        >
          <RiskDot risk={asset.riskLevel} />
          <span className="asset-item-body">
            <span className="asset-item-name">{asset.name}</span>
            <span className="asset-item-status">
              {asset.status === "anomaly"
                ? `${asset.likelyCause} · ${Math.round((asset.confidence ?? 0) * 100)}% confidence`
                : "All sensors within normal range"}
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}
