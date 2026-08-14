function UnmappedItems({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="unmapped-items">
      <h3>
        ⚠ {items.length} item{items.length === 1 ? "" : "s"} posted as a placeholder — needs to be added in QuickBooks
      </h3>
      <p>
        These weren't found in the item catalog, so they were posted against the
        dummy/placeholder item instead. Add each one in QuickBooks, then re-run the SKU sync.
      </p>
      <table className="unmapped-items-table">
        <thead>
          <tr>
            <th>Vendor Code</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>{item.vendorCode || "—"}</td>
              <td>{item.description || "—"}</td>
              <td>{item.qty ?? "—"}</td>
              <td>{typeof item.amount === "number" ? `$${item.amount.toFixed(2)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UnmappedItems;
