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

      {/* Body */}
      <h1>Amazon Business Helper</h1>

      <nav>
        <NavLink to="/" end>
          Vendor Invoices
        </NavLink>
        {" | "}
        <NavLink to="/amazon-sales">Amazon Sales Sync</NavLink>
        {" | "}
        <NavLink to="/amazon-fees">Amazon Fees</NavLink>
        {" | "}
        <NavLink to="/amazon-refunds">Amazon Refunds</NavLink>
        {" | "}
        <NavLink to="/amazon-reimbursements">Amazon Reimbursements</NavLink>
        {" | "}
        <NavLink to="/amazon-settlement">Amazon Settlement</NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<ImportForm />} />
        <Route path="/amazon-sales" element={<AmazonSalesSync />} />
        <Route path="/amazon-fees" element={<AmazonFeesPull />} />
        <Route path="/amazon-refunds" element={<AmazonRefundsPull />} />
        <Route path="/amazon-reimbursements" element={<AmazonReimbursementsPull />} />
        <Route path="/amazon-settlement" element={<AmazonSettlementReconciliation />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
