import { useState } from "react";

function AmazonSettlementReconciliation() {
  const [fundDate, setFundDate] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function runReconciliation({ postTransfer = false, trueUpFees = false, force = false } = {}) {
    setError("");

    if (!fundDate) {
      setError("Please pick the settlement's fund date.");
      return;
    }

    if (postTransfer) {
      const confirmed = window.confirm(
        `Post the real bank transfer for this settlement (moves the settlement total from Amazon Receivable into WB Community Business checking)?${
          force ? "\n\nForcing despite missing items or amount mismatches." : ""
        }`
      );
      if (!confirmed) return;
    }

    if (trueUpFees) {
      const confirmed = window.confirm(
        `Patch every flagged Sales Receipt's referral/FBA fee lines to the settlement's actual amounts? This edits real, already-posted transactions.${
          force ? "\n\nForcing despite missing items or amount mismatches." : ""
        }`
      );
      if (!confirmed) return;
    }

    setRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/reconcileAmazonSettlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundDate, postTransfer, trueUpFees, force }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `Reconciliation failed with status ${response.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  const missing = result?.findings?.missing || [];
  const mismatches = result?.findings?.amount_mismatch || [];
  const feeVariance = result?.findings?.fee_estimate_variance || [];
  const hasRedFlags = missing.length > 0 || mismatches.length > 0;

  return (
    <div className="amazon-settlement-reconciliation">
      <h2>Amazon Settlement Reconciliation</h2>
      <p>
        Pulls one Amazon settlement's full event breakdown and compares it
        against what's posted in QuickBooks, matched by order ID (not date
        range, since settlement cutoffs don't align to calendar days).
        Reconciling never posts or corrects anything by itself; it just
        surfaces variance for review. Referral/FBA fee variance is expected
        (amazon_sales.py posts fee estimates, this shows the gap to actual);
        missing items and amount mismatches are real flags worth checking.
        Posting the bank transfer is a separate, explicit step below --
        it moves the settlement's net total out of Amazon Receivable into
        the real bank account, and is blocked if there are unresolved
        missing items or amount mismatches (unless forced).
      </p>

      <div className="date-fields">
        <label>
          Settlement fund date
          <input type="date" value={fundDate} onChange={(e) => setFundDate(e.target.value)} />
        </label>
        <button onClick={() => runReconciliation()} disabled={running}>
          {running ? "Working..." : "Reconcile"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="results">
          <h3>
            Settlement {result.group_id}
          </h3>
          <p>
            Fund date: {result.fund_date} | Amazon total: ${result.settlement_total} | Checked: {result.checked_at}
          </p>
          <p>
            {result.sales_orders} sales orders, {result.refund_orders} refunds, {result.adjustment_events} adjustment events.
            Service fee total (informational, reconciles monthly): ${result.service_fee_total}
          </p>
          <p>
            <strong>Total fee estimate variance: ${result.total_fee_estimate_variance}</strong>{" "}
            ({result.total_fee_estimate_variance < 0 ? "QBO currently overstates" : "QBO currently understates"} net income by this much until trued up)
          </p>

          <section>
            <h4>Bank transfer</h4>
            {result.transfer ? (
              <p>
                Posted: Transfer Id {result.transfer.id} -- ${result.transfer.amount} moved from Amazon Receivable
                to bank, dated {result.transfer.txn_date}.
              </p>
            ) : (
              <>
                {result.transfer_skipped_reason && <p>Not posted: {result.transfer_skipped_reason}</p>}
                <button onClick={() => runReconciliation({ postTransfer: true })} disabled={running}>
                  Post bank transfer
                </button>
                {hasRedFlags && (
                  <button onClick={() => runReconciliation({ postTransfer: true, force: true })} disabled={running}>
                    Post anyway (--force)
                  </button>
                )}
              </>
            )}
          </section>

          <section>
            <h4>Missing from QuickBooks ({missing.length})</h4>
            {missing.length === 0 ? (
              <p>None -- everything Amazon says is in this settlement has a matching QBO transaction.</p>
            ) : (
              <ul>
                {missing.map((m, i) => (
                  <li key={i}>
                    {m.type === "sale" && `Sale order ${m.order_id}: Amazon principal $${m.amazon_principal} -- not found in QBO`}
                    {m.type === "refund" && `Refund order ${m.order_id}: Amazon refund $${m.amazon_refund} -- not found in QBO`}
                    {m.type === "adjustment" && `Adjustment ${m.fingerprint}: $${m.amazon_amount} -- not found in reimbursements log`}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>Amount mismatches ({mismatches.length}) -- real red flags</h4>
            {mismatches.length === 0 ? (
              <p>None.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Order</th>
                    <th>Amazon</th>
                    <th>QBO</th>
                  </tr>
                </thead>
                <tbody>
                  {mismatches.map((m, i) => (
                    <tr key={i}>
                      <td>{m.type}</td>
                      <td>{m.order_id}</td>
                      <td>${m.amazon}</td>
                      <td>${m.qbo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h4>Fee estimate variance ({feeVariance.length}) -- expected, quantifies estimate vs actual</h4>
            {feeVariance.length === 0 ? (
              <p>None.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Referral actual</th>
                    <th>Referral posted</th>
                    <th>FBA actual</th>
                    <th>FBA posted</th>
                    <th>Net diff</th>
                  </tr>
                </thead>
                <tbody>
                  {feeVariance.map((f, i) => (
                    <tr key={i}>
                      <td>{f.order_id}</td>
                      <td>${f.referral_fee_actual}</td>
                      <td>${f.referral_fee_posted}</td>
                      <td>${f.fba_fee_actual}</td>
                      <td>${f.fba_fee_posted}</td>
                      <td>${f.net_diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {result.trueup ? (
              <p>
                Trued up {result.trueup.count} Sales Receipt(s) to actual settled fees at {result.trueup.trued_up_at}.
              </p>
            ) : feeVariance.length > 0 ? (
              <>
                {result.trueup_skipped_reason && <p>Not trued up: {result.trueup_skipped_reason}</p>}
                <button onClick={() => runReconciliation({ trueUpFees: true })} disabled={running}>
                  True up fees to actual
                </button>
                {hasRedFlags && (
                  <button onClick={() => runReconciliation({ trueUpFees: true, force: true })} disabled={running}>
                    True up anyway (--force)
                  </button>
                )}
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

export default AmazonSettlementReconciliation;
