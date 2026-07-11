import type { DiagnosisResult } from "./types";

export function formatNarrative(diagnosis: DiagnosisResult): string {
  const { primary, alternative } = diagnosis;
  const matchedCount = primary.evidence.filter((e) => e.matched).length;
  const confidencePct = Math.round(primary.confidence * 100);

  const lines = [
    `${primary.label} is the most likely cause (${confidencePct}% confidence), based on ${matchedCount} of ${primary.evidence.length} correlated signals matching this failure pattern.`,
  ];

  if (primary.correctionCount > 0) {
    lines.push(
      `This assessment reflects ${primary.correctionCount} prior operator correction${
        primary.correctionCount === 1 ? "" : "s"
      } for this pattern on this asset (adjusted ×${primary.patternWeight.toFixed(2)}).`
    );
  }

  if (alternative) {
    lines.push(`${alternative.label} is a secondary possibility (${Math.round(alternative.confidence * 100)}% confidence).`);
  }

  return lines.join(" ");
}
