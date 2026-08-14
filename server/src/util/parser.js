import pool from '../util/db.js';

function getQuickBooksId(vendor, id) {
  const column = vendor === 'acd' ? 'acd_id' : 'universal_id';
  return pool.query(`SELECT qbo_id FROM inventory.converter WHERE ${column} = $1`, [id]);
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

  // Find item-row-start indexes for items that have no UPC on file with
  // Universal at all (some vendors, especially small-press games, only get
  // a short internal item number instead of a real barcode). The PDF often
  // glues the Item No. and Vendor No. columns together with zero space
  // (e.g. "1107CPS1107Cradle of Civilization..."), so this can't depend on
  // whitespace, and it also can't depend on the vendor code already being
  // in inventory.converter -- that's exactly the case (a brand new item)
  // where this needs to fire. Instead it uses a purely structural signal:
  // every item row starts with a bare digit run (the Item No., any length)
  // immediately followed by an uppercase letter (the Vendor No.) with zero
  // space -- the only other rows in this document that start with a digit
  // (address numbers, tracking numbers, the "2% Cash Discount Reversal"
  // line) are always followed by a space, slash, hyphen, or end of line,
  // never an uppercase letter glued straight on.
  //
  // A second, rarer shape: some Item Nos are themselves a short letter
  // prefix plus digits with an embedded space (e.g. "ECG 025", not a bare
  // digit run at all), immediately followed by the glued Vendor No/
  // description with zero space (e.g. "ECG 025ECG025Atlantis Rising..."
  // -- the whole item was getting silently absorbed into the previous
  // item's segment since neither this nor the digit-run rule recognized
  // it as a boundary). Same structural signal, just letter-prefixed.
  function indexOfItemRowStarts(text) {
    const output = [];
    const lines = text.split('\n');
    let offset = 0;
    for (const line of lines) {
      if (/^\d+(?=[A-Z])/.test(line) || /^[A-Z]{2,5} ?\d+(?=[A-Z])/.test(line)) {
        output.push(offset);
      }
      offset += line.length + 1; // +1 for the '\n' consumed by split
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

  function extractTotal(text) {
    const normalized = text.replace(/,/g, '');
    const patterns = [
      /invoice\s*total\s*[:\-]?\s*\$\s*(\d+(?:\.\d{1,2})?)/i,
      /order\s*total\s*[:\-]?\s*\$\s*(\d+(?:\.\d{1,2})?)/i,
      /\btotal\s*[:\-]?\s*\$\s*(\d+(?:\.\d{1,2})?)/i,
      /\$\s*(\d+(?:\.\d{1,2})?)\s*total\b/i
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const total = parseFloat(match[1]);
      if (!Number.isNaN(total)) return Math.round(total * 100) / 100;
    }

    return null;
  }

  function extractInvoiceNumber(text) {
    const patterns = [
      /invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*(\S+)/i,
      /inv(?:oice)?[\s\-#]*([A-Z0-9\-]+)/i,
      /order\s*(?:no\.?|number|#)\s*[:\-]?\s*(\S+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      if (match[1]) return match[1].trim();
    }

    return null;
  }

  // Fetch all known Universal vendor codes once, sorted longest-first for greedy prefix matching
  const knownVendorRows = await pool.query(
    'SELECT universal_id FROM inventory.converter WHERE universal_id IS NOT NULL AND universal_id <> \'\''
  );
  const knownVendors = knownVendorRows.rows
    .map(r => r.universal_id)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  // Item boundaries come from two sources: any 12/13-digit UPC (the normal
  // case), plus any line starting with a bare digit run immediately
  // followed by an uppercase letter (items with no UPC on file). Merge and
  // dedupe since a UPC line matches both.
  const upcIndexes = indexOfUPC(input);
  const itemRowIndexes = indexOfItemRowStarts(input);
  const boundaryIndexes = Array.from(new Set([...upcIndexes, ...itemRowIndexes]));
  const items = splitInput(input, boundaryIndexes);
  const handlingFee = extractHandlingFee(input);
  const freight = extractFreight(input);
  const realTotal = extractTotal(input);
  const invoiceNumber = extractInvoiceNumber(input);

  let addedTotal = 0;
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
    "DocNumber": invoiceNumber,
    "AccountRef": {
      "value": creditCard.value,
      "name": creditCard.name
    },
    "TxnDate": date,
    "EntityRef": {
      "value": "9",
      "name": "Universal Distribution",
      "type": "Vendor"
    },
    "Line": []
  };

  for (const item of items) {
    const firstLine = item.split('\n').find(l => l.trim().length > 0) || '';
    // Find where the vendor code ends. The PDF sometimes omits the column
    // space, gluing the vendor code directly onto the description with no
    // delimiter (e.g. "AT-38110DRAGON SHIELD..."), and vendor codes can
    // contain a hyphen -- a character class can't reliably capture that
    // (it either excludes hyphens and truncates early, or includes them
    // and bleeds into the description). UPCs are also 12 or 13 digits, and
    // when the vendor code itself is numeric (e.g. "16506") there's no
    // character-level way to tell where the UPC ends and the code begins.
    // So try both possible UPC lengths and check the actual known vendor
    // list (longest-first) as a literal prefix of what's left -- whichever
    // length yields a real match is the correct split.
    let vendorNum = '';
    let vendorEndIndex = -1;
    for (const upcLen of [13, 12]) {
      const upcCandidate = firstLine.slice(0, upcLen);
      if (upcCandidate.length !== upcLen || !/^\d+$/.test(upcCandidate)) continue;
      const afterUpc = firstLine.slice(upcLen);
      const stripped = afterUpc.replace(/^ +/, '');
      const match = knownVendors.find(v => stripped.startsWith(v));
      if (match) {
        vendorNum = match;
        vendorEndIndex = upcLen + (afterUpc.length - stripped.length) + match.length;
        break;
      }
    }

    // Items Universal has no UPC on file for: Item No. is a short internal
    // number (any length, not 12/13 digits) or absent entirely, immediately
    // followed by the known vendor code -- with or without a space (the PDF
    // glues these together as often as not).
    if (!vendorNum) {
      const digitMatch = firstLine.match(/^(\d+)(\s*)/);
      const afterDigits = digitMatch ? firstLine.slice(digitMatch[0].length) : firstLine;
      const match = knownVendors.find(v => afterDigits.startsWith(v));
      if (match) {
        vendorNum = match;
        vendorEndIndex = (digitMatch ? digitMatch[0].length : 0) + match.length;
      }
    }

    if (!vendorNum) {
      // Not a known vendor code yet -- best-effort candidate (only used
      // for the Unknown-item log/description) until it's added to
      // inventory.converter, at which point the match above picks it up.
      // Leading digits can be any length here, not just a 12/13-digit UPC
      // (that case is already handled above) -- greedily consume all of
      // them first so a short internal item number doesn't get confused
      // with the start of the vendor code. The captured code must start
      // with a letter (every real vendor code does) -- without that, a
      // stray 12/13-digit number elsewhere in the document (a tracking
      // number, etc.) can backtrack into treating its own trailing digits
      // as a fake vendor code. Minimum 2 total characters (1 letter + 1
      // more), not 3 -- some real vendor codes are exactly 2 characters
      // (e.g. "PF" for Pathfinder Battles), and a 3-char minimum was
      // silently dropping the whole item (not even showing "Unknown")
      // whenever a short code like that was followed by a space before
      // the description instead of being glued directly onto it.
      const rawMatch = firstLine.match(/^\d*[ ]?([A-Z][A-Z0-9_-]{1,})/);
      vendorNum = rawMatch ? rawMatch[1] : '';
      vendorEndIndex = rawMatch ? rawMatch[0].length : -1;
    }

    const dollarIndex = item.indexOf('$');
    let quantity = null;
    if (dollarIndex !== -1) {
      const lineBeforeDollar = item.slice(0, dollarIndex).split('\n').pop() || '';
      const m = lineBeforeDollar.match(/(\d+)\s*$/);
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
    const description = (vendorEndIndex >= 0 ? beforePricing.slice(vendorEndIndex) : beforePricing)
      .replace(/\s*\b\d+\s*$/m, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!vendorNum) continue;
    addedTotal += amount || 0;
    const key = vendorNum;
    const idResult = await getQuickBooksId('universal', key);
    const quickBooksId = idResult.rows[0]?.qbo_id ?? 'Unknown';
    output["Line"].push({
      "DetailType": "ItemBasedExpenseLineDetail",
      "Amount": amount,
      "Description": description,
      "ItemBasedExpenseLineDetail": {
        "ItemRef": {
          "value": quickBooksId,
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

  output["Line"].push({
    "DetailType": "AccountBasedExpenseLineDetail",
    "Amount": Math.round((realTotal - addedTotal - (handlingFee || 0) - (freight || 0)) * 100) / 100,
    "Description": "Rounding Variance",
    "AccountBasedExpenseLineDetail": {
      "AccountRef": {
        "value": "1150040007",
        "name": "Rounding Variance"
      }
    }
  });

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

  function extractTotal(text) {
    const normalized = text.replace(/,/g, '');
    const patterns = [
      /invoice\s*total\s*[:\-]?\s*\$\s*(\d+(?:\.\d{1,2})?)/i,
      /order\s*total\s*[:\-]?\s*\$\s*(\d+(?:\.\d{1,2})?)/i,
      /\btotal\s*[:\-]?\s*\$\s*(\d+(?:\.\d{1,2})?)/i,
      /\$\s*(\d+(?:\.\d{1,2})?)\s*total\b/i
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match) continue;
      const total = parseFloat(match[1]);
      if (!Number.isNaN(total)) return Math.round(total * 100) / 100;
    }

    return null;
  }

  function extractInvoiceNumber(text) {
    const patterns = [
      /invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*(\S+)/i,
      /inv(?:oice)?[\s\-#]*([A-Z0-9\-]+)/i,
      /order\s*(?:no\.?|number|#)\s*[:\-]?\s*(\S+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      if (match[1]) return match[1].trim();
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

  function addDays(dateString, days) {
    if (!dateString) return undefined;
    const [y, m, d] = dateString.split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
  }

  const handlingFee = extractHandlingFee(input);
  const realTotal = extractTotal(input);
  const invoiceNumber = extractInvoiceNumber(input);

  const output = {
    "VendorRef": {
      "value": "11"
    },
    "TxnDate": date,
    "SalesTermRef": {
      "value": "3",
      "name": "Net 30"
    },
    "DueDate": addDays(date, 30),
    "DocNumber": invoiceNumber,
    "Line": []
  };

  const lines = input.split('\n');
  // ACD's "Pricing" column (e.g. "SDI") is glued directly onto the end of
  // the description with no separating space when present, but only shows
  // up on some rows -- there's no formatting cue to tell where a real
  // description ends and a glued-on code begins, so match against a known
  // list instead of guessing from case. Add to this list if ACD introduces
  // new codes. Vendor codes can contain a hyphen (e.g. "CAO23166-H").
  const PRICING_CODES = ['SDI'];
  const itemMainPattern = /^([A-Z][A-Z0-9-]*)\s+([\d.]+)\s+(\d{1,4})(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const itemMatch = lines[i].match(itemMainPattern);
    if (!itemMatch) continue;

    const key = itemMatch[1];
    const idResult = await getQuickBooksId('acd', key);
    const quickBooksId = idResult.rows[0]?.qbo_id ?? 'Unknown';
    const amount = parseFloat(itemMatch[2]);
    const qty = parseInt(itemMatch[3], 10);
    let description = itemMatch[4].trim();
    for (const code of PRICING_CODES) {
      if (description.endsWith(code)) {
        description = description.slice(0, -code.length).trim();
        break;
      }
    }

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
          "value": quickBooksId
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
          "value": "1150040006"
        }
      }
    });
  }
  return { output, realTotal };
}

