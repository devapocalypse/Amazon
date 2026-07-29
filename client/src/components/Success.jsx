import { useLocation, Navigate, Link } from "react-router-dom";
import JsonViewer from "./JsonViewer";

function Success() {
  const location = useLocation();
  const state = location.state;

  // Reached directly via URL (no data passed via navigation) -- bounce home.
  if (!state || !state.result) {
    return <Navigate to="/" replace />;
  }

  const { result, showRawJson, title } = state;

  return (
    <div className="import-success">
      <h2>{title || "Submitted"}</h2>
      <div className="success">✓ Invoice submitted successfully.</div>

      {showRawJson && <JsonViewer data={result} />}

      <Link to="/" className="back-link">
        ← Back to import
      </Link>
    </div>
  );
}

export default Success;