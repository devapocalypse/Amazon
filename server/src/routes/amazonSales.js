import { Router } from 'express';
import { execFile } from 'child_process';

const router = Router();

const PYTHON_BIN = process.env.AMAZON_SALES_PYTHON || '/root/Amazon_Automation/venv/bin/python';
const SCRIPT_DIR = process.env.AMAZON_SALES_DIR || '/root/Amazon_Automation';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Only one run at a time -- the script's local dedup log isn't safe for concurrent writers.
let syncInProgress = false;

function parseSummary(output) {
  const summary = {
    newReceipts: [],
    duplicatesSkipped: [],
    duplicateErrors: [],
    missingSkus: [],
    otherErrors: [],
  };

  for (const line of output.split('\n')) {
    let match;

    if ((match = line.match(/^Success! Sales Receipt #(\d+) created for order (\S+)\.$/))) {
      summary.newReceipts.push({ receiptId: match[1], orderId: match[2] });
      continue;
    }

    if ((match = line.match(/^Order (\S+) already recorded -- skipping\.$/))) {
      summary.duplicatesSkipped.push({ orderId: match[1] });
      continue;
    }

    if ((match = line.match(/^QuickBooks Upload Failed for order (\S+): (.+)$/))) {
      const [, orderId, detail] = match;
      const dupMatch = detail.match(/Duplicate Document Number Error.*TxnId=(\d+)/);
      if (dupMatch) {
        summary.duplicateErrors.push({ orderId, existingTxnId: dupMatch[1] });
      } else {
        summary.otherErrors.push({ orderId, detail });
      }
      continue;
    }

    // Only the placeholder-fallback line means a SKU is genuinely unmapped in QuickBooks --
    // a plain cache-miss line ("missing from local cache. Querying...") often still resolves.
    if ((match = line.match(/^SKU (\S+) not found in QuickBooks -- using placeholder item (\S+)$/))) {
      summary.missingSkus.push({ sku: match[1], placeholderItemId: match[2] });
      continue;
    }
  }

  return summary;
}

router.post('/syncAmazonSales', (req, res) => {
  const { start, end } = req.body || {};

  if (!start || !DATE_RE.test(start) || (end && !DATE_RE.test(end))) {
    return res.status(400).json({ error: 'start (and optional end) must be YYYY-MM-DD' });
  }

  if (syncInProgress) {
    return res.status(409).json({ error: 'A sync is already running -- wait for it to finish.' });
  }

  syncInProgress = true;

  const args = ['amazon_sales.py', '--start', start, '--end', end || start];

  execFile(
    PYTHON_BIN,
    args,
    { cwd: SCRIPT_DIR, maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 },
    (err, stdout, stderr) => {
      syncInProgress = false;
      const raw = `${stdout || ''}${stderr || ''}`;

      if (err && !stdout) {
        return res.status(500).json({ error: `Sync failed to run: ${err.message}`, raw });
      }

      res.json({ summary: parseSummary(raw), raw });
    }
  );
});

export default router;
