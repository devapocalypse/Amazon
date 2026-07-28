import { useState } from "react";

function AmazonSalesSync() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function handleRun() {
    setError("");

    if (!start) {
      setError("Please pick a start date.");
      return;
    }

    const rangeLabel = end && end !== start ? `${start} through ${end}` : start;
    const confirmed = window.confirm(
      `Run Amazon sales sync for ${rangeLabel} (Central Time)?\n\nThis creates real Sales Receipts in QuickBooks.`
    );
    if (!confirmed) return;

    setRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/syncAmazonSales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end: end || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `Sync failed with status ${response.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  const summary = result?.summary;

  return (
    <div className="amazon-sales-sync">
      <h2>Amazon Sales Sync</h2>
      <p>
        Pulls Amazon's FBA shipped-orders report for a day (or range, Central Time)
        and pushes new orders to QuickBooks as Sales Receipts.
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
        <button onClick={handleRun} disabled={running}>
          {running ? "Running..." : "Run Sync"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {summary && (
        <div className="results">
          {summary.missingSkus.length > 0 && (
            <section className="missing-skus">
              <h3>⚠ {summary.missingSkus.length} SKU(s) missing from QuickBooks</h3>
              <ul>
                {summary.missingSkus.map((m, i) => (
                  <li key={i}>{m.sku} (used placeholder item {m.placeholderItemId})</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3>✓ {summary.newReceipts.length} new Sales Receipt(s) created</h3>
            <ul>
              {summary.newReceipts.map((r, i) => (
                <li key={i}>
                  Order {r.orderId} → Receipt #{r.receiptId}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>↩ {summary.duplicatesSkipped.length} duplicate(s) skipped (already recorded)</h3>
          </section>

          {summary.duplicateErrors.length > 0 && (
            <section>
              <h3>⚠ {summary.duplicateErrors.length} order(s) already in QuickBooks but not in the local log</h3>
              <ul>
                {summary.duplicateErrors.map((d, i) => (
                  <li key={i}>
                    Order {d.orderId} (existing Receipt TxnId {d.existingTxnId})
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.otherErrors.length > 0 && (
            <section className="errors">
              <h3>✗ {summary.otherErrors.length} other error(s)</h3>
              <ul>
                {summary.otherErrors.map((e, i) => (
                  <li key={i}>
                    Order {e.orderId}: {e.detail}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <details>
            <summary>Raw output</summary>
            <pre>{result.raw}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default AmazonSalesSync;
