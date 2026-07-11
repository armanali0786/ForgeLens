export type Direction = "up" | "down" | "flat";
export type RiskLevel = "low" | "medium" | "high";
export type Verdict = "correct" | "wrong" | "snoozed";
export type AnomalyStatus = "open" | "acknowledged" | "resolved" | "snoozed";

export interface AssetSummary {
  id: number;
  name: string;
  type: string;
  location: string | null;
  riskLevel: RiskLevel;
  status: "normal" | "anomaly";
  likelyCause: string | null;
  confidence: number | null;
  openAnomalyId: number | null;
}

export interface Sensor {
  id: number;
  assetId: number;
  name: string;
  unit: string;
  normalRangeMin: string;
  normalRangeMax: string;
}

export interface AssetDetail {
  id: number;
  name: string;
  type: string;
  location: string | null;
  sensors: Sensor[];
}

export interface EvidenceItem {
  id: number;
  anomalyId: number;
  signalName: string;
  changeDescription: string;
  weight: string;
}

export interface Feedback {
  id: number;
  anomalyId: number;
  engineerVerdict: Verdict;
  actualCause: string | null;
  createdAt: string;
}

export interface Anomaly {
  id: number;
  assetId: number;
  detectedAt: string;
  riskLevel: RiskLevel;
  likelyCause: string;
  confidence: string;
  status: AnomalyStatus;
  evidence: EvidenceItem[];
  asset: { id: number; name: string; type: string; location: string | null };
  feedback?: Feedback[];
  diagnosis?: { primary: CandidateCause; alternative: CandidateCause | null };
}

export interface CandidateCause {
  patternName: string;
  label: string;
  confidence: number;
  baseScore: number;
  patternWeight: number;
  correctionCount: number;
  evidence: {
    signalName: string;
    direction: Direction;
    pctChange: number;
    changeDescription: string;
    weight: number;
    matched: boolean;
  }[];
  actionPlan: string[];
  etaToFailureHours: [number, number];
}

export interface DiagnosisResult {
  assetId: number;
  triggerSignal: string;
  triggerFlag: "out_of_range" | "rapid_change";
  riskLevel: RiskLevel;
  primary: CandidateCause;
  alternative: CandidateCause | null;
}

export interface AnomalyNewPayload {
  anomaly: Anomaly;
  diagnosis: DiagnosisResult;
  narrative: string;
}

export interface HistoryPoint {
  detectedAt: string;
  confidence: number;
  verdicts: Verdict[];
}
