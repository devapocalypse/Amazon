import { useState } from "react";

function SyncResults({ result }) {
  const summary = result?.summary;
  if (!summary) return null;

  return (
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
  );
}

function AmazonSalesSync() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState(null);

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

  async function handleUpload() {
    setUploadError("");

    if (!file) {
      setUploadError("Choose a report file first.");
      return;
    }

    const confirmed = window.confirm(
      `Process "${file.name}" and create real Sales Receipts in QuickBooks from it?`
    );
    if (!confirmed) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/syncAmazonSalesFromFile", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setUploadError(data.error || `Upload failed with status ${response.status}`);
      } else {
        setUploadResult(data);
      }
    } catch (err) {
      setUploadError(String(err));
    } finally {
      setUploading(false);
    }
  }

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
      <SyncResults result={result} />

      <hr />

      <h3>Upload Report File Instead</h3>
      <p>
        If a sync above has been slow or timing out (Amazon's report generation can take
        up to an hour on some days), request the same report by hand in Seller Central
        under <strong>Reports → Fulfillment → Amazon Fulfilled Shipments</strong>, download
        the flat file, and upload it here. This skips waiting on Amazon entirely.
      </p>

      <div className="file-field">
        <input
          type="file"
          accept=".txt,.tsv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button onClick={handleUpload} disabled={uploading}>
          {uploading ? "Processing..." : "Upload & Process"}
        </button>
      </div>

      {uploadError && <div className="error">{uploadError}</div>}
      <SyncResults result={uploadResult} />
    </div>
  );
}

export default AmazonSalesSync;
