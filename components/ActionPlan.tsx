export function ActionPlan({ steps, etaHours }: { steps: string[]; etaHours: [number, number] }) {
  return (
    <div className="panel">
      <h2>Action Plan</h2>
      <ol className="action-list">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="eta">
        Estimated time to failure: <strong className="mono">{etaHours[0]}–{etaHours[1]} hours</strong> if unaddressed
      </div>
    </div>
  );
}
