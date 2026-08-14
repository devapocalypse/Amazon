import { useState } from "react";

function AmazonFeesPull() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleRun(force = false) {
    setError("");

    if (!start) {
      setError("Please pick a start date.");
      return;
    }

    const rangeLabel = end && end !== start ? `${start} through ${end}` : start;
    const confirmed = window.confirm(
      `Pull and post Amazon fees for ${rangeLabel} (Central Time)?\n\nThis creates real Purchase transactions in QuickBooks -- one per fee occurrence, except storage/inbound-convenience/long-term-storage fees, which are summed into a single combined line per pull.`
    );
    if (!confirmed) return;

    setRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/pullAmazonFees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end: end || undefined, force }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `Pull failed with status ${response.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="amazon-fees-pull">
      <h2>Amazon Fees</h2>
      <p>
        Pulls Amazon's periodic FBA fees (storage, inbound transportation, inbound
        placement, removal, subscription, long-term storage) for a day or range
        (Central Time) and posts them to QuickBooks as one Purchase transaction per
        fee occurrence -- except storage, inbound convenience, and long-term storage
        fees, which are summed into a single combined line per pull to match how
        Amazon's settlement report shows them.
      </p>

      <div className="date-fields">
        <label>
          Start date
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          End date (optional, defaults to start)
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <button onClick={() => handleRun(false)} disabled={running}>
          {running ? "Running..." : "Pull & Post Fees"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="results">
          <h3>
            {result.lines.length} fee occurrence(s) pulled, {result.start} to {result.end}, total ${result.total.toFixed(2)}
          </h3>

          {result.posted && (
            <div>
              <p>✓ Posted to QuickBooks as {result.purchases.length} transaction(s):</p>
              <table>
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Amount</th>
                    <th>Order/Reference ID</th>
                    <th>Purchase Id</th>
                  </tr>
                </thead>
                <tbody>
                  {result.purchases.map((purchase, i) => (
                    <tr key={i}>
                      <td>
                        {purchase.fee_type}
                        {purchase.occurrence_count > 1 ? ` (${purchase.occurrence_count} occurrences summed)` : ""}
                      </td>
                      <td>{purchase.amount.toFixed(2)}</td>
                      <td>{purchase.order_id}</td>
                      <td>{purchase.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!result.posted && result.skipped_reason && (
            <div className="error">
              <p>NOT posted: {result.skipped_reason}</p>
              <button onClick={() => handleRun(true)} disabled={running}>
                Post anyway (--force)
              </button>
            </div>
          )}

          {!result.posted && !result.skipped_reason && result.lines.length === 0 && (
            <p>Nothing to post -- no fees found in this window.</p>
          )}

          {result.lines.length > 0 && (
            <>
              <h4>All pulled fee occurrences (raw, before summarization)</h4>
              <table>
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Amount</th>
                    <th>Order/Reference ID</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line, i) => (
                    <tr key={i}>
                      <td>{line.fee_type}</td>
                      <td>{line.amount.toFixed(2)}</td>
                      <td>{line.order_id}</td>
                      <td>{line.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AmazonFeesPull;
