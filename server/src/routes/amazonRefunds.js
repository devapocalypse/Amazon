import { Router } from 'express';
import { execFile } from 'child_process';

const router = Router();

const PYTHON_BIN = process.env.AMAZON_SALES_PYTHON || '/root/Amazon_Automation/venv/bin/python';
const SCRIPT_DIR = process.env.AMAZON_SALES_DIR || '/root/Amazon_Automation';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Only one run at a time -- the posted-order dedup log isn't safe for concurrent writers.
let refundsInProgress = false;

router.post('/pullAmazonRefunds', (req, res) => {
  const { start, end } = req.body || {};

  if (!start || !DATE_RE.test(start) || (end && !DATE_RE.test(end))) {
    return res.status(400).json({ error: 'start (and optional end) must be YYYY-MM-DD' });
  }

  if (refundsInProgress) {
    return res.status(409).json({ error: 'A refund pull/post is already running -- wait for it to finish.' });
  }

  refundsInProgress = true;

  const args = ['amazon_refunds.py', '--start', start, '--end', end || start, '--json'];

  execFile(
    PYTHON_BIN,
    args,
    { cwd: SCRIPT_DIR, maxBuffer: 20 * 1024 * 1024, timeout: 10 * 60 * 1000 },
    (err, stdout, stderr) => {
      refundsInProgress = false;

      if (err) {
        return res.status(500).json({ error: `Refund pull/post failed to run: ${err.message}`, raw: stderr || stdout });
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
