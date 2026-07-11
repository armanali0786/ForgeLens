"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAssets } from "../lib/api";
import { getSocket } from "../lib/socket";
import type { AnomalyNewPayload } from "../lib/types";
import { AssetList } from "./AssetList";
import { AlertDetail } from "./AlertDetail";

export function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Captured at click time rather than derived from the live assets query, so
  // submitting feedback (which resolves the anomaly and clears the asset's
  // openAnomalyId) doesn't yank the detail view out from under the operator
  // mid-confirmation — AlertDetail keeps showing this anomaly until they pick another.
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<number | null>(null);
  const [pulsingId, setPulsingId] = useState<number | null>(null);
  const [connected, setConnected] = useState(true);

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: getAssets,
    refetchInterval: 15_000,
  });

  function handleSelect(id: number) {
    setSelectedId(id);
    setSelectedAnomalyId(assets?.find((a) => a.id === id)?.openAnomalyId ?? null);
  }

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onAnomalyNew = (payload: AnomalyNewPayload) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      setPulsingId(payload.anomaly.assetId);
      setTimeout(() => setPulsingId(null), 250);
    };

    const onAnomalyUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("anomaly:new", onAnomalyNew);
    socket.on("anomaly:updated", onAnomalyUpdated);
    socket.on("feedback:recorded", onAnomalyUpdated);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("anomaly:new", onAnomalyNew);
      socket.off("anomaly:updated", onAnomalyUpdated);
      socket.off("feedback:recorded", onAnomalyUpdated);
    };
  }, [queryClient]);

  const selectedAsset = assets?.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-brand">ForgeLens</span>
          <span className="topbar-subtitle">Industrial Decision Copilot</span>
        </div>
        <div className="topbar-right">
          <span className="live-indicator" data-connected={connected}>
            <span className="live-dot" aria-hidden="true" />
            {connected ? "Live" : "Reconnecting"}
          </span>
          <span className="topbar-divider" aria-hidden="true" />
          <span className="topbar-user">
            <span className="topbar-avatar">AA</span>
            <span className="topbar-meta">Arman Ali</span>
          </span>
        </div>
      </div>
      {!connected && (
        <div className="connection-banner">Live feed disconnected. Showing last known state. Reconnecting…</div>
      )}
      <div className="console">
        <AssetList
          assets={assets ?? []}
          selectedId={selectedId}
          pulsingId={pulsingId}
          onSelect={handleSelect}
        />
        <main className="main">
          {!selectedAsset && (
            <div className="empty-state">
              <p>Select an asset from the list to view its current status.</p>
            </div>
          )}
          {selectedAsset && !selectedAnomalyId && (
            <div className="empty-state">
              <p>
                No active anomalies. All five {selectedAsset.name} sensors are within normal range.
              </p>
            </div>
          )}
          {selectedAsset && selectedAnomalyId && (
            <AlertDetail assetName={selectedAsset.name} anomalyId={selectedAnomalyId} />
          )}
        </main>
      </div>
    </div>
  );
}
