import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import "./App.css";
import ImportForm from "./components/ImportForm";
import AmazonSalesSync from "./components/AmazonSalesSync";
import AmazonFeesPull from "./components/AmazonFeesPull";
import AmazonRefundsPull from "./components/AmazonRefundsPull";
import AmazonReimbursementsPull from "./components/AmazonReimbursementsPull";
import AmazonSettlementReconciliation from "./components/AmazonSettlementReconciliation";

function App() {
  return (
    <BrowserRouter>
      {/* Head */}
      <title>Amazon Business Helper</title>

      <div className="app-shell">
        {/* Body */}
        <h1>Amazon Business Helper</h1>

        <nav>
          <NavLink to="/" end>
            Universal Invoices
          </NavLink>
          <NavLink to="/acd-invoices">ACD Invoices</NavLink>
          <NavLink to="/amazon-sales">Amazon Sales Sync</NavLink>
          <NavLink to="/amazon-fees">Amazon Fees</NavLink>
          <NavLink to="/amazon-refunds">Amazon Refunds</NavLink>
          <NavLink to="/amazon-reimbursements">Amazon Reimbursements</NavLink>
          <NavLink to="/amazon-settlement">Amazon Settlement</NavLink>
        </nav>

        <main>
          <Routes>
            <Route
              path="/"
              element={
                <ImportForm
                  hasCreditCard
                  action="/api/parseUniversal"
                  title="Universal Invoice Import"
                  description="Upload a Universal vendor invoice PDF and post it to QuickBooks as an expense."
                />
              }
            />
            <Route
              path="/acd-invoices"
              element={
                <ImportForm
                  hasCreditCard={false}
                  action="/api/parseACD"
                  title="ACD Invoice Import"
                  description="Upload an ACD vendor invoice PDF and post it to QuickBooks as a bill."
                />
              }
            />
            <Route path="/amazon-sales" element={<AmazonSalesSync />} />
            <Route path="/amazon-fees" element={<AmazonFeesPull />} />
            <Route path="/amazon-refunds" element={<AmazonRefundsPull />} />
            <Route path="/amazon-reimbursements" element={<AmazonReimbursementsPull />} />
            <Route path="/amazon-settlement" element={<AmazonSettlementReconciliation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
