import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';

import { parseUniversal, parseACD } from './util/parser.js';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 4000;

const QBO_EXPENSE_URL = process.env.QBO_EXPENSE_URL || 'http://127.0.0.1:5000/api/upload-expense';
const QBO_BILL_URL = process.env.QBO_BILL_URL || 'http://127.0.0.1:5000/api/upload-bill';

app.use(cors());
app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
const indexHtml = path.join(clientDist, 'index.html');

const upload = multer({ storage: multer.memoryStorage() });

async function pushToQuickBooks(qboPayload, url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(qboPayload)
  });

  const result = await response.json();

  if (!response.ok) {
    // Surface Flask/QuickBooks's actual error message rather than a generic one
    const message = result && result.message ? result.message : `Upload failed with status ${response.status}`;
    throw new Error(message);
  }

  return result;
}

app.post('/api/parseUniversal', upload.single('file'), async (req, res) => {
  try {
    let inputText;
    let creditCard;

    if (req.file && req.file.buffer) {
      const data = await pdf(req.file.buffer);
      inputText = data && data.text ? data.text : '';
    } else {
      const body = req.body || {};
      inputText = body.input || '';
    }

    switch (req.body.creditCard) {
      case 'WB_COMMUNITY':
        creditCard = {
          value: process.env.WB_CREDIT_ID,
          name: "Westbury Credit Card"
        }
        break;

      default:
        creditCard = {
          value: "Unknown",
          name: "Unknown"
        }
    }

    const result = await parseUniversal(inputText, creditCard);
    const qboResult = await pushToQuickBooks(result.output, QBO_EXPENSE_URL);

    res.json({ parsed: result.output, quickbooks: qboResult });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/parseACD', upload.single('file'), async (req, res) => {
  try {
    let inputText = '';

    if (req.file && req.file.buffer) {
      const data = await pdf(req.file.buffer);
      inputText = data && data.text ? data.text : '';
    } else {
      const body = req.body || {};
      inputText = body.input || '';
    }

    let creditCard;

    const result = await parseACD(inputText, creditCard);
    const qboResult = await pushToQuickBooks(result.output, QBO_BILL_URL);

    res.json({ parsed: result.output, quickbooks: qboResult });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.use(express.static(clientDist));

app.get(/.*/, (req, res) => {
  res.sendFile(indexHtml);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});