import type { DiagnosisResult } from "./types";

const GROQ_TIMEOUT_MS = 5000;
const GROQ_MODEL = "llama-3.1-8b-instant";

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

/**
 * The only place an LLM is allowed to touch this project (ARCHITECTURE.md ADR-4).
 * It receives nothing but the already-computed diagnosis facts — never raw telemetry
 * — and is instructed to rephrase, not decide. formatNarrative()'s deterministic
 * template is both the fallback (no key, request fails, or times out) and the
 * factual ceiling the model is told not to exceed.
 */
export async function buildNarrative(diagnosis: DiagnosisResult): Promise<string> {
  const fallback = formatNarrative(diagnosis);

  const apiKey = process.env.LLM_API_KEY;
  const provider = process.env.LLM_PROVIDER;
  if (!apiKey || provider !== "groq") {
    return fallback;
  }

  const { primary, alternative } = diagnosis;
  const facts = {
    likely_cause: primary.label,
    confidence_pct: Math.round(primary.confidence * 100),
    evidence: primary.evidence.map((e) => ({
      signal: e.signalName,
      direction: e.direction,
      matched_expected_pattern: e.matched,
      description: e.changeDescription,
    })),
    prior_operator_corrections: primary.correctionCount,
    pattern_weight_adjustment: primary.patternWeight,
    alternative_cause: alternative ? { label: alternative.label, confidence_pct: Math.round(alternative.confidence * 100) } : null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "You narrate an industrial anomaly diagnosis for a facility engineer. " +
              "You are given a JSON object of facts already computed by a deterministic rule engine. " +
              "Rephrase them into 2-3 plain, concise sentences a busy engineer can scan in seconds. " +
              "Rules: use ONLY the facts given — never invent a number, sensor, cause, or percentage " +
              "that isn't in the JSON; never change the likely_cause or confidence_pct; no bullet points, " +
              "no markdown, no preamble like 'Based on the data'.",
          },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[explain] Groq request failed (${res.status}), using template narrative`);
      return fallback;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || fallback;
  } catch (err) {
    console.warn("[explain] Groq call errored, using template narrative:", (err as Error).message);
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
