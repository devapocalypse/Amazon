import { Router } from 'express';
import { execFile } from 'child_process';

const router = Router();

const PYTHON_BIN = process.env.AMAZON_SALES_PYTHON || '/root/Amazon_Automation/venv/bin/python';
const SCRIPT_DIR = process.env.AMAZON_SALES_DIR || '/root/Amazon_Automation';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The reconcile-only path never posts/corrects anything, but --post-transfer
// and --true-up-fees do post/patch real transactions -- either way, avoid
// overlapping runs since they'd race on the same reconciliation log file.
let reconciliationInProgress = false;

router.post('/reconcileAmazonSettlement', (req, res) => {
  const { fundDate, groupId, postTransfer, trueUpFees, force } = req.body || {};

  if (!groupId && (!fundDate || !DATE_RE.test(fundDate))) {
    return res.status(400).json({ error: 'fundDate must be YYYY-MM-DD (or pass groupId to target a specific settlement directly)' });
  }

  if (reconciliationInProgress) {
    return res.status(409).json({ error: 'A reconciliation run is already in progress -- wait for it to finish.' });
  }

  reconciliationInProgress = true;

  const args = ['amazon_settlement_reconciliation.py', '--json'];
  // groupId targets one settlement directly -- required when fundDate
  // matches more than one (the script reports the choices instead of
  // guessing; see the "multiple_settlements" response shape below). Send
  // fundDate alongside it too, when we have it: the script uses that to
  // load the settlement's real metadata (amount, fund date) for
  // --post-transfer -- without it, --group-id alone can reconcile but
  // can't post the bank transfer (no amount to post).
  if (groupId) {
    args.push('--group-id', groupId);
    if (fundDate && DATE_RE.test(fundDate)) args.push('--fund-date', fundDate);
  } else {
    args.push('--fund-date', fundDate);
  }
  if (postTransfer) args.push('--post-transfer');
  if (trueUpFees) args.push('--true-up-fees');
  if (force) args.push('--force');

  execFile(
    PYTHON_BIN,
    args,
    { cwd: SCRIPT_DIR, maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 },
    (err, stdout, stderr) => {
      reconciliationInProgress = false;

      if (err) {
        return res.status(500).json({ error: `Reconciliation failed to run: ${err.message}`, raw: stderr || stdout });
      }

      try {
        const parsed = JSON.parse(stdout.trim().split('\n').pop());
        res.json(parsed);
      } catch (parseErr) {
        res.status(500).json({ error: `Could not parse script output: ${parseErr.message}`, raw: stdout + stderr });
      }
    }
  );
});

export default router;
