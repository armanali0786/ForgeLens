import type { Anomaly, AssetDetail, AssetSummary, HistoryPoint, Verdict } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function getAssets(): Promise<AssetSummary[]> {
  return request("/api/assets");
}

export function getAsset(id: number): Promise<AssetDetail> {
  return request(`/api/assets/${id}`);
}

export function getAnomaly(id: number): Promise<Anomaly> {
  return request(`/api/anomalies/${id}`);
}

export function getHistory(assetId: number, pattern: string): Promise<HistoryPoint[]> {
  return request(`/api/assets/${assetId}/history/${encodeURIComponent(pattern)}`);
}

export function postFeedback(anomalyId: number, verdict: Verdict, actualCause?: string) {
  return request(`/api/anomalies/${anomalyId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ verdict, actualCause }),
  });
}

export { API_URL };
