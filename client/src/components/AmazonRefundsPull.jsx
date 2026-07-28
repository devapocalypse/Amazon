import { useState } from "react";

function AmazonRefundsPull() {
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
      `Pull and post Amazon refunds for ${rangeLabel} (Central Time)?\n\nThis creates real Refund Receipts in QuickBooks (one per order), plus Inventory Adjustments for any damaged/unsellable returns.`
    );
    if (!confirmed) return;

    setRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/pullAmazonRefunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end: end || undefined }),
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
    <div className="amazon-refunds-pull">
      <h2>Amazon Refunds</h2>
      <p>
        Pulls Amazon customer refunds for a day or range (Central Time) and posts
        one Refund Receipt per order to QuickBooks. Sellable returns restock
        automatically; damaged/unfulfillable returns get an extra Inventory
        Adjustment write-off; refunds with no physical return on record post as
        revenue-only, leaving inventory untouched.
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
          {running ? "Running..." : "Pull & Post Refunds"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="results">
          <h3>{result.orders.length} order(s), {result.start} to {result.end}</h3>

          {result.orders.map((order, i) => (
            <div key={i} className="refund-order">
              <strong>Order {order.order_id}</strong>
              {order.posted && <span> -- Posted as Refund Receipt Id {order.refund_receipt_id}</span>}
              {!order.posted && order.skipped_reason && <span className="error"> -- NOT posted: {order.skipped_reason}</span>}
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Refund</th>
                    <th>Referral Credit</th>
                    <th>Admin Fee</th>
                    <th>Disposition</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line, j) => (
                    <tr key={j}>
                      <td>{line.sku}</td>
                      <td>{line.refund_amount.toFixed(2)}</td>
                      <td>{line.referral_fee_credit.toFixed(2)}</td>
                      <td>{line.refund_admin_fee.toFixed(2)}</td>
                      <td>{line.disposition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {order.writeoffs && order.writeoffs.length > 0 && (
                <ul>
                  {order.writeoffs.map((w, k) => (
                    <li key={k}>
                      {w.inventory_adjustment_id
                        ? `Write-off: ${w.sku} x${w.quantity} (${w.disposition}) -> Inventory Adjustment Id ${w.inventory_adjustment_id}`
                        : `Write-off SKIPPED: ${w.sku} x${w.quantity} (${w.disposition}) -- ${w.note}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AmazonRefundsPull;
