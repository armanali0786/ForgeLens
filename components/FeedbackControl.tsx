"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postFeedback } from "../lib/api";
import type { Verdict } from "../lib/types";

const OTHER_CAUSES = ["Valve degradation", "Fan fault", "Filter clog", "Sensor fault", "Other"];

export function FeedbackControl({
  anomalyId,
  assetId,
  pattern,
  existingVerdict,
}: {
  anomalyId: number;
  assetId: number;
  pattern: string;
  existingVerdict: Verdict | null;
}) {
  const [pickingCause, setPickingCause] = useState(false);
  const [recordedVerdict, setRecordedVerdict] = useState<Verdict | null>(existingVerdict);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ verdict, actualCause }: { verdict: Verdict; actualCause?: string }) =>
      postFeedback(anomalyId, verdict, actualCause),
    onSuccess: (_data, variables) => {
      setRecordedVerdict(variables.verdict);
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["anomaly", anomalyId] });
      queryClient.invalidateQueries({ queryKey: ["history", assetId, pattern] });
    },
  });

  if (recordedVerdict) {
    const message =
      recordedVerdict === "correct"
        ? "Recorded as correct."
        : recordedVerdict === "wrong"
        ? "Recorded as wrong."
        : "Snoozed.";
    return (
      <div className="panel">
        <h2>Feedback</h2>
        <p className="feedback-confirmation">{message} This will adjust future matches for this pattern.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Feedback</h2>
      <div className="feedback-buttons">
        <button data-variant="correct" onClick={() => mutation.mutate({ verdict: "correct" })}>
          Correct
        </button>
        <button data-variant="wrong" onClick={() => setPickingCause(true)}>
          Wrong
        </button>
        <button data-variant="snooze" onClick={() => mutation.mutate({ verdict: "snoozed" })}>
          Snooze
        </button>
      </div>
      {pickingCause && (
        <CausePicker
          onSubmit={(actualCause) => mutation.mutate({ verdict: "wrong", actualCause })}
        />
      )}
    </div>
  );
}

function CausePicker({ onSubmit }: { onSubmit: (cause: string) => void }) {
  const [cause, setCause] = useState(OTHER_CAUSES[0]);
  return (
    <div className="cause-picker">
      <select value={cause} onChange={(e) => setCause(e.target.value)}>
        {OTHER_CAUSES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button data-variant="wrong" onClick={() => onSubmit(cause)}>
        Confirm
      </button>
    </div>
  );
}
