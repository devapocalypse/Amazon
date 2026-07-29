import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import JsonViewer from "./JsonViewer";

function ImportForm({ hasCreditCard, action, title, description }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [creditCard, setCreditCard] = useState("");
  const [showRawJson, setShowRawJson] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  function isPdfFile(f) {
    if (!f) return false;
    return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  }

  function handleFileChange(e) {
    setError("");
    setResult(null);
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!isPdfFile(f)) {
      setError("Please upload a PDF file.");
      e.target.value = "";
    }
  }

  async function handleSubmit(e) {
    setError("");
    setResult(null);
    const f = fileInputRef.current?.files?.[0];

    if (hasCreditCard && !creditCard) {
      e.preventDefault();
      setError("Please select a credit card.");
      return;
    }

    if (!f) {
      e.preventDefault();
      setError("Please select a PDF file to upload.");
      return;
    }

    if (!isPdfFile(f)) {
      e.preventDefault();
      setError("Please upload a PDF file.");
      return;
    }

    // Neither viewing option is picked: let the browser submit the form
    // natively (full page reload/navigation), same as before.
    if (!showRawJson && !showConfirmation) {
      return;
    }

    e.preventDefault();

    const formData = new FormData();
    formData.append("file", f);
    if (hasCreditCard) formData.append("creditCard", creditCard);

    setSubmitting(true);
    try {
      const response = await fetch(action, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `Submit failed with status ${response.status}`);
      } else if (showConfirmation) {
        navigate("/success", { state: { result: data, showRawJson, title } });
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="import-form">
      <h2>{title}</h2>
      <p>{description}</p>

      <form
        id="upload-form"
        method="post"
        action={action}
        encType="multipart/form-data"
        onSubmit={handleSubmit}
      >
        <label htmlFor="file">Click to Pick a File</label>

        <input
          type="file"
          id="file"
          name="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf"
        />

        {hasCreditCard && (
          <select
            name="creditCard"
            id="creditCard"
            value={creditCard}
            onChange={(e) => setCreditCard(e.target.value)}
          >
            <option value="" disabled hidden>
              Select Credit Card
            </option>
            <option value="WB_CREDIT">WB Credit Card</option>
          </select>
        )}

        {error && <div className="error">{error}</div>}

        <button type="submit" className="upload-submit-button" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit"}
        </button>

        <div className="import-form-options">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={showRawJson}
              onChange={(e) => setShowRawJson(e.target.checked)}
            />
            Show raw JSON response
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={showConfirmation}
              onChange={(e) => setShowConfirmation(e.target.checked)}
            />
            Show confirmation screen
          </label>
        </div>
      </form>

      {result && showRawJson && (
        <div className="results">
          <JsonViewer data={result} />
        </div>
      )}
    </div>
  );
}

export default ImportForm;