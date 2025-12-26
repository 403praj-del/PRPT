import { Ocr } from '@capacitor-community/image-to-text';

/**
 * OCR + field extraction (Google ML Kit via Capacitor)
 */
export const analyzeImage = async (imageSrc) => {
  if (!imageSrc) {
    throw new Error('prepare_failed');
  }

  try {
    console.log('[OCR] Starting:', imageSrc);

    let options;

    // Base64 (PDF canvas / web)
    if (imageSrc.startsWith('data:')) {
      const base64 = imageSrc.split(',')[1];
      if (!base64 || base64.length < 100) {
        throw new Error('prepare_failed');
      }
      options = { base64 };
    } 
    // Native file path (Camera / Gallery)
    else {
      options = { filename: imageSrc };
    }

    const result = await Ocr.detectText(options);
    const textDetections = result?.textDetections || [];

    const fullText = textDetections
      .map(d => d.text)
      .join('\n')
      .trim();

    console.log('[OCR] Extracted text:', fullText);

    // If OCR worked but text is weak → allow manual entry
    if (!fullText) {
      return emptyResult();
    }

    const amount = extractAmount(fullText);
    const merchant = extractMerchant(fullText);
    const date = extractDate(fullText) || today();

    return {
      text: fullText,
      amount,
      merchant,
      date,
      category: extractCategory(fullText),
      invoice_number: extractInvoiceNumber(fullText),
      payment_method: extractPaymentMethod(fullText),
      hasFields: Boolean(amount || merchant),
    };

  } catch (err) {
    console.error('[OCR] Error:', err);

    const msg = (err?.message || '').toLowerCase();

    if (msg.includes('permission')) throw new Error('permission');
    if (msg.includes('prepare')) throw new Error('prepare_failed');

    // LAST fallback
    throw new Error('ocr_failed');
  }
};

/* ---------------- Helpers ---------------- */

const today = () => new Date().toISOString().split('T')[0];

const emptyResult = () => ({
  text: '',
  amount: '',
  merchant: '',
  date: today(),
  category: 'Other',
  invoice_number: '',
  payment_method: 'UPI',
  hasFields: false,
});

/* -------- REGEX FIXED BELOW -------- */

const extractAmount = (text) => {
  const amountRegex =
    /(?:RS|INR|₹|TOTAL|AMOUNT|AMT)\s*[:=]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/gi;

  const matches = [...text.matchAll(amountRegex)];
  if (matches.length) {
    return matches[matches.length - 1][1].replace(/,/g, '');
  }

  const priceRegex = /\b\d{1,5}[.,]\d{2}\b/g;
  const prices = text.match(priceRegex);
  if (!prices) return '';

  return prices
    .map(p => p.replace(/,/g, ''))
    .sort((a, b) => parseFloat(b) - parseFloat(a))[0];
};

const extractDate = (text) => {
  const dateRegex =
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})|(\d{4})[/-](\d{1,2})[/-](\d{1,2})/;

  const match = text.match(dateRegex);
  if (!match) return null;

  let y, m, d;
  if (match[1]) {
    d = match[1].padStart(2, '0');
    m = match[2].padStart(2, '0');
    y = match[3].length === 2 ? '20' + match[3] : match[3];
  } else {
    y = match[4];
    m = match[5].padStart(2, '0');
    d = match[6].padStart(2, '0');
  }
  return `${y}-${m}-${d}`;
};

const extractCategory = (text) => {
  const categories = {
    FOOD: ['food', 'restaurant', 'cafe', 'swiggy', 'zomato'],
    TRAVEL: ['uber', 'ola', 'taxi', 'bus', 'flight'],
    GROCERY: ['grocery', 'dmart', 'market', 'store'],
    HOTEL: ['hotel', 'lodge', 'resort'],
    ROOM_STAY: ['rent', 'pg', 'hostel'],
  };

  const t = text.toLowerCase();
  for (const [cat, keys] of Object.entries(categories)) {
    if (keys.some(k => t.includes(k))) return cat;
  }
  return 'Other';
};

const extractMerchant = (text) => {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  return lines[0] || '';
};

const extractInvoiceNumber = (text) => {
  const invoiceRegex =
    /(?:INV|INVOICE|BILL|TXN|TRANSACTION|RECEIPT|REF)\s*(?:NO|ID|NUMBER)?\s*[:#=]?\s*([A-Z0-9/-]{4,})/i;

  const match = text.match(invoiceRegex);
  return match ? match[1] : '';
};

const extractPaymentMethod = (text) => {
  const t = text.toLowerCase();
  if (t.includes('cash')) return 'CASH';
  if (t.includes('card') || t.includes('visa') || t.includes('mastercard'))
    return 'CARD';
  return 'UPI';
};
