import pool from '../util/db.js';

function getAmazonId(vendor, id) {
  const column = vendor === 'acd' ? 'acd_id' : 'universal_id';
  return pool.query(`SELECT amazon_id FROM inventory.converter WHERE ${column} = $1`, [id]);
}

export async function parseUniversal(input, creditCard) {
  function extractHandlingFee(text) {
    const normalized = text.replace(/,/g, '');
    const patterns = [
      /handling\s*fee\s*[:\-]?\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i,
      /\$\s*(-?\d+(?:\.\d{1,2})?)\s*handling\s*fee/i,
      /handling\b[^\n\r$]{0,60}?\$\s*(-?\d+(?:\.\d{1,2})?)/i
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const fee = parseFloat(match[1]);
      if (!Number.isNaN(fee)) return Math.round(fee * 100) / 100;
    }

    return null;
  }

  // Find all indexes of 12 or 13 digit numbers in the input text (UPC indexes)
  function indexOfUPC(text) {
    const output = [];
    const re = /\d{12,13}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      output.push(m.index);
    }
    return output;
  }

  // Split the input text into segments based on the UPC indexes
  function splitInput(text, indexes) {
    const output = [];
    if (!indexes || indexes.length === 0) return [text];
    const idx = indexes.slice().sort((a, b) => a - b);
    for (let i = 0; i < idx.length; i++) {
      const start = idx[i];
      const end = idx[i + 1] || text.length;
      output.push(text.slice(start, end));
    }
    return output;
  }

  function extractFreight(text) {
    const normalized = text.replace(/,/g, '');
    const patterns = [
      /extended\s*area\s*charge\b[^\n\r$]{0,60}?\$\s*(-?\d+(?:\.\d{1,2})?)/i,
      /\$\s*(-?\d+(?:\.\d{1,2})?)\s*extended\s*area\s*charge/i
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const fee = parseFloat(match[1]);
      if (!Number.isNaN(fee)) return Math.round(fee * 100) / 100;
    }

    return null;
  }

  const upcIndexes = indexOfUPC(input);
  const items = splitInput(input, upcIndexes);
  const handlingFee = extractHandlingFee(input);
  const freight = extractFreight(input);

  // Fetch all known Universal vendor codes once, sorted longest-first for greedy prefix matching
  const knownVendorRows = await pool.query(
    'SELECT universal_id FROM inventory.converter WHERE universal_id IS NOT NULL AND universal_id <> \'\''
  );
  const knownVendors = knownVendorRows.rows
    .map(r => r.universal_id)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let date;
  const dateMatch = input.match(/(\b\d{1,2}\/\d{1,2}\/\d{4}\b)|(\b\d{4}-\d{2}-\d{2}\b)/);
  if (dateMatch) {
    const raw = dateMatch[0];
    if (raw.includes('/')) {
      const [m, d, y] = raw.split('/');
      date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    } else {
      date = raw;
    }
  }

  const output = {
    "PaymentType": "CreditCard",
    "AccountRef": {
      "value": creditCard.value,
      "name": creditCard.name
    },
    "TxnDate": date,
    "EntityRef": {
      "value": "95", // Unknown
      "name": "Universal Distribution",
      "type": "Vendor"
    },
    "Line": []
  };

  for (const item of items) {
    const firstLine = item.split('\n').find(l => l.trim().length > 0) || '';
    // Capture all contiguous uppercase alphanumeric chars after the UPC as a candidate vendor string,
    // then resolve against known vendor codes to handle cases where the PDF omits the column space.
    const rawMatch = firstLine.match(/^(?:\d{12,13}?) *([A-Z0-9]{3,})/);
    const rawVendor = rawMatch ? rawMatch[1] : '';
    const vendorNum = knownVendors.find(v => rawVendor.startsWith(v)) || rawVendor;

    const dollarIndex = item.indexOf('$');
    let quantity = null;
    if (dollarIndex !== -1) {
      const beforeDollar = item.slice(0, dollarIndex);
      const m = beforeDollar.match(/(\d+)\s*$/m);
      if (m) quantity = parseInt(m[1], 10);
    }

    const secondDollarIndex = item.indexOf('$', dollarIndex + 1);
    let unitPrice;
    let amount;
    if (secondDollarIndex !== -1) {
      unitPrice = Math.round(parseFloat(item.slice(dollarIndex + 1, secondDollarIndex).trim()) * 1.02 * 100) / 100;
      amount = Math.round(parseFloat(unitPrice) * parseInt(quantity, 10) * 100) / 100;
    }

    // Find description from the full pre-price section to preserve multiline names
    const beforePricing = dollarIndex !== -1 ? item.slice(0, dollarIndex) : item;
    const vendorEscaped = vendorNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const description = beforePricing
      .replace(new RegExp(`^\\s*\\d{12,13} *${vendorEscaped}\\s*`), '')
      .replace(/\s*\b\d+\s*$/m, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!vendorNum) continue;
    const key = vendorNum;
    const idResult = await getAmazonId('universal', key);
    const amazonId = idResult.rows[0]?.amazon_id ?? 'Unknown';
    output["Line"].push({ 
      "DetailType": "ItemBasedExpenseLineDetail",
      "Amount": amount,
      "Description": description,
      "ItemBasedExpenseLineDetail": {
        "ItemRef": {
          "value": amazonId,
          "name": key
        },
        "UnitPrice": unitPrice,
        "Qty": quantity
      }
    });

  }

  if (handlingFee !== null) {
    output["Line"].push({
      "DetailType": "AccountBasedExpenseLineDetail",
      "Amount": handlingFee,
      "Description": "Handling Fee",
      "AccountBasedExpenseLineDetail": {
        "AccountRef": {
          "value": "1150040006",
          "name": "Handling Fee"
        }
      }
    });
  }

  if (freight !== null) {
    output["Line"].push({
      "DetailType": "AccountBasedExpenseLineDetail",
      "Amount": freight,
      "Description": "Freight",
      "AccountBasedExpenseLineDetail": {
        "AccountRef": {
          "value": "1150040016",
          "name": "Freight"
        }
      }
    });
  }

  return { output };
}

export async function parseACD(input, creditCard) {
  input = input.replace(/\r\n?/g, '\n');

  function extractHandlingFee(text) {
    const normalized = text.replace(/,/g, '');
    const patterns = [
      /handling\s*fee\s*[:\-]?\s*\$?\s*(-?\d+(?:\.\d{1,2})?)/i,
      /\$\s*(-?\d+(?:\.\d{1,2})?)\s*handling\s*fee/i,
      /handling\b[^\n\r$]{0,60}?\$\s*(-?\d+(?:\.\d{1,2})?)/i
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const fee = parseFloat(match[1]);
      if (!Number.isNaN(fee)) return Math.round(fee * 100) / 100;
    }

    return null;
  }

  let date;
  const dateMatch = input.match(/(\b\d{1,2}\/\d{1,2}\/\d{4}\b)|(\b\d{4}-\d{2}-\d{2}\b)/);
  if (dateMatch) {
    const raw = dateMatch[0];
    if (raw.includes('/')) {
      const [m, d, y] = raw.split('/');
      date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    } else {
      date = raw;
    }
  }

  const handlingFee = extractHandlingFee(input);

  const output = {
    "PaymentType": "CreditCard",
    "AccountRef": {
      "value": creditCard.value,
      "name": creditCard.name
    },
    "TxnDate": date,
    "EntityRef": {
      "value": "11",
      "name": "ACD Distribution",
      "type": "Vendor"
    },
    "Line": []
  };

  const lines = input.split('\n');
  const itemMainPattern = /^([A-Z][A-Z0-9]*)\s+([\d.]+)\s+(\d{1,4})(.+?)([A-Z]{2,5})$/;

  for (let i = 0; i < lines.length; i++) {
    const itemMatch = lines[i].match(itemMainPattern);
    if (!itemMatch) continue;

    const key = itemMatch[1];
    const idResult = await getAmazonId('acd', key);
    const amazonId = idResult.rows[0]?.amazon_id ?? 'Unknown';
    const amount = parseFloat(itemMatch[2]);
    const qty = parseInt(itemMatch[3], 10);
    const description = itemMatch[4].trim();

    let unitPrice = Math.round((amount / qty) * 100) / 100;
    const priceLine = (lines[i + 2] || '').trim();
    const priceMatch = priceLine.match(/^([\d.]+)/);
    if (priceMatch) unitPrice = parseFloat(priceMatch[1]);

    output["Line"].push({
      "DetailType": "ItemBasedExpenseLineDetail",
      "Amount": amount,
      "Description": description,
      "ItemBasedExpenseLineDetail": {
        "ItemRef": {
          "value": amazonId,
          "name": key
        },
        "UnitPrice": unitPrice,
        "Qty": qty
      }
    });
  }

  if (handlingFee !== null) {
    output["Line"].push({
      "DetailType": "AccountBasedExpenseLineDetail",
      "Amount": handlingFee,
      "Description": "Handling Fee",
      "AccountBasedExpenseLineDetail": {
        "AccountRef": {
          "value": "Unknown",
          "name": "Handling Fee"
        }
      }
    });
  }

  return { output };
}