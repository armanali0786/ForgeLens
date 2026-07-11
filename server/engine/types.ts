export type Direction = "up" | "down" | "flat";
export type RiskLevel = "low" | "medium" | "high";
export type DetectionFlag = "out_of_range" | "rapid_change";

export interface EvidenceItem {
  signalName: string;
  direction: Direction;
  pctChange: number;
  changeDescription: string;
  weight: number;
  matched: boolean;
}

export interface CandidateCause {
  patternName: string;
  label: string;
  confidence: number;
  baseScore: number;
  patternWeight: number;
  correctionCount: number;
  evidence: EvidenceItem[];
  actionPlan: string[];
  etaToFailureHours: [number, number];
}

export interface DiagnosisResult {
  assetId: number;
  triggerSignal: string;
  triggerFlag: DetectionFlag;
  riskLevel: RiskLevel;
  primary: CandidateCause;
  alternative: CandidateCause | null;
}
