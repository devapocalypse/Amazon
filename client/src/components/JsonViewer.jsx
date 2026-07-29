function JsonViewer({ data }) {
  return (
    <div className="json-viewer">
      <div className="json-viewer-titlebar">
        <span className="json-viewer-dot json-viewer-dot-red" />
        <span className="json-viewer-dot json-viewer-dot-yellow" />
        <span className="json-viewer-dot json-viewer-dot-green" />
        <span className="json-viewer-label">response.json</span>
      </div>
      <pre className="json-viewer-body">
        <code>{JSON.stringify(data, null, 2)}</code>
      </pre>
    </div>
  );
}

export default JsonViewer;
