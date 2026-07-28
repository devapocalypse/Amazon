import { useState, useRef } from "react";

function ImportForm({ hasCreditCard, action, title, description }) {
  const [error, setError] = useState("");
  const [creditCard, setCreditCard] = useState("");
  const fileInputRef = useRef(null);

  function isPdfFile(f) {
    if (!f) return false;
    return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
  }

  function handleFileChange(e) {
    setError("");
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!isPdfFile(f)) {
      setError("Please upload a PDF file.");
      e.target.value = "";
    }
  }

  function handleSubmit(e) {
    setError(null);
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
            <option value="WB_COMMUNITY">WB Credit Card</option>
          </select>
        )}

        {error && <div className="error">{error}</div>}

        <button type="submit" className="upload-submit-button">
          Submit
        </button>
      </form>
    </div>
  );
}

export default ImportForm;
