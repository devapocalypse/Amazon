import { useState } from "react";

function AmazonReimbursementsPull() {
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
      `Pull and post Amazon adjustments/reimbursements for ${rangeLabel} (Central Time)?\n\nEach event creates its own real Deposit in QuickBooks, dated the day it happened, plus Inventory Adjustments for lost/damaged/recovered stock.`
    );
    if (!confirmed) return;

    setRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/pullAmazonReimbursements", {
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
    <div className="amazon-reimbursements-pull">
      <h2>Amazon Reimbursements</h2>
      <p>
        Pulls Amazon's warehouse-caused inventory adjustment events (lost/damaged
        stock, inbound discrepancies, clawbacks) for a day or range (Central Time).
        Each event posts as its own separate QuickBooks Deposit, dated the day it
        actually happened -- not batched together. Real losses get an inventory
        write-off; a missing-from-inbound claim that Amazon later reverses adds the
        unit back to stock (Amazon found it). ReserveDebit/Credit and failed payouts
        are excluded from posting and shown separately for your review.
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
          {running ? "Running..." : "Pull & Post"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="results">
          <h3>
            {result.lines.length} line(s), {result.start} to {result.end}, total ${result.total.toFixed(2)}
          </h3>
          <p>{result.posted_count} posted, {result.skipped_count} skipped</p>

          {result.skipped_count > 0 && (
            <button onClick={() => handleRun(true)} disabled={running}>
              Retry skipped (--force)
            </button>
          )}

          {result.excluded && result.excluded.length > 0 && (
            <section>
              <h4>Excluded ({result.excluded.length}, not posted)</h4>
              <ul>
                {result.excluded.map((e, i) => (
                  <li key={i}>{e.adjustment_type}: ${e.amount.toFixed(2)} ({e.posted_date})</li>
                ))}
              </ul>
            </section>
          )}

          {result.lines.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line, i) => (
                  <tr key={i}>
                    <td>{line.txn_date}</td>
                    <td>{line.adjustment_type}</td>
                    <td>{line.category}</td>
                    <td>{line.amount.toFixed(2)}</td>
                    <td>{line.sku}</td>
                    <td>{line.description}</td>
                    <td>
                      {line.posted
                        ? `Deposit Id ${line.deposit_id}${line.writeoff ? (line.writeoff.inventory_adjustment_id ? ` + Adjustment Id ${line.writeoff.inventory_adjustment_id}` : ` (write-off skipped: ${line.writeoff.note})`) : ""}`
                        : line.skipped_reason
                          ? `Skipped: ${line.skipped_reason}`
                          : "(dry run)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default AmazonReimbursementsPull;
