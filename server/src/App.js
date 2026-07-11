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

app.use(cors());
app.use(bodyParser.json());

app.use(bodyParser.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
const indexHtml = path.join(clientDist, 'index.html');

const upload = multer({ storage: multer.memoryStorage() });

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
          value: process.env.WB_COMMUNITY_ID,
          name: "WB Community Business (2696)"
        }
        break;

      default:
        creditCard = {
          value: "Unknown",
          name: "Unknown"
        }
    }

    const result = await parseUniversal(inputText, creditCard);
    res.json(result);
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

    switch (req.body.creditCard) {
      case 'WB_COMMUNITY':
        creditCard = {
          value: process.env.WB_COMMUNITY_ID,
          name: "WB Community Business (2696)"
        }
        break;

      default:
        creditCard = {
          value: "Unknown",
          name: "Unknown"
        }
    }

    const result = await parseACD(inputText, creditCard);
    res.json(result);
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