import { Ocr } from '@capacitor-community/image-to-text';

/**
 * Stable OCR + Receipt Parsing using ML Kit
 * @param {string} imageSrc - MUST be a valid native file path (file://...)
 */
export const analyzeImage = async (imageSrc) => {
  if (!imageSrc) {
    throw new Error('prepare_failed');
  }

  // 1. Safety Check: Prevent passing PDF or invalid paths to ML Kit
  if (imageSrc.endsWith('.pdf')) {
    console.error('[OCR] PDF files are not supported by ML Kit image processing.');
    throw new Error('invalid_file_type'); 
  }

  try {
    console.log('[OCR] Starting analysis with source:', imageSrc);

    // 2. Normalize path: Ensure it looks like a file path if it isn't already
    // (Some Android versions behave better if 'file://' is explicitly present)
    const finalPath = imageSrc.startsWith('/') ? `file://${imageSrc}` : imageSrc;

    const options = {
      filename: finalPath,
    };

    const result = await Ocr.detectText(options);
    const textDetections = result?.textDetections || [];

    // Combine detected text safely
    const fullText = textDetections
      .map((d) => d.text)
      .join('\n')
      .trim();

    console.log('[OCR] Extracted text length:', fullText.length);

    // 3. Handle weak/empty text gracefully
    if (!fullText) {
      console.warn('[OCR] Text detection returned empty string.');
      return createEmptyReceipt();
    }

    // 4. Run Extraction Logic
    const amount = extractAmount(fullText);
    const merchant = extractMerchant(fullText);
    const date = extractDate(fullText) || new Date().toISOString().split('T')[0];
    
    // Determine if we actually found useful data
    const hasFields = Boolean(amount || merchant);

    return {
      text: fullText,
      amount,
      merchant,
      date,
      category: extractCategory(fullText),
      invoice_number: extractInvoiceNumber(fullText),
      payment_method: extractPaymentMethod(fullText),
      hasFields
    };

  } catch (err) {
    console.error('[OCR] Native OCR error:', err);
    
    // Standardize error messages for the UI
    const msg = err?.message?.toLowerCase() || '';

    if (msg.includes('file not found') || msg.includes('no such file')) {
        throw new Error('file_not_found');
    }
    if (msg.includes('permission')) {
      throw new Error('permission');
    }
    if (msg.includes('prepare')) {
      throw new Error('prepare_failed');
    }

    throw new Error('ocr_failed');
  }
};

/**
 * Helper to return a blank receipt object
 */
const createEmptyReceipt = () => ({
  text: '',
  amount: '',
  merchant: '',
  date: new Date().toISOString().split('T')[0],
  category: 'Other',
  invoice_number: '',
  payment_method: 'UPI',
  hasFields: false
});

/* -------------------- EXTRACTION HELPERS -------------------- */

const extractAmount = (text) => {
  // Enhanced regex to catch "Total 1,200.00" or "Amount: 500"
  const amountRegex = /(?:RS|INR|₹|TOTAL|AMOUNT|AMT|NET|PAYABLE)\s*[:=.]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/gi;

  const matches = [...text.matchAll(amountRegex)];
  if (matches.length > 0) {
    // Return the last match found (usually the "Total" at the bottom)
    return matches[matches.length - 1][1].replace(/,/g, '');
  }

  // Fallback: Find the largest number that looks like a price
  const priceRegex = /\b\d{1,5}[.,]\d{2}\b/g;
  const prices = text.match(priceRegex);
  if (!prices) return '';

  return prices
    .map(p => p.replace(/,/g, ''))
    .sort((a, b) => parseFloat(b) - parseFloat(a))[0];
};

const extractDate = (text) => {
  // Matches DD/MM/YYYY, YYYY-MM-DD, etc.
  const dateRegex = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})|(\d{4})[/-](\d{1,2})[/-](\d{1,2})/;

  const match = text.match(dateRegex);
  if (!match) return null;

  let y, m, d;
  if (match[1]) {
    // Format: DD-MM-YYYY
    d = match[1].padStart(2, '0');
    m = match[2].padStart(2, '0');
    y = match[3].length === 2 ? '20' + match[3] : match[3];
  } else {
    // Format: YYYY-MM-DD
    y = match[4];
    m = match[5].padStart(2, '0');
    d = match[6].padStart(2, '0');
  }

  return `${y}-${m}-${d}`;
};

const extractCategory = (text) => {
  const categories = {
    FOOD: ['food', 'restaurant', 'cafe', 'swiggy', 'zomato', 'kitchen', 'tea', 'coffee'],
    TRAVEL: ['uber', 'ola', 'taxi', 'bus', 'flight', 'rail', 'petrol', 'fuel'],
    GROCERY: ['grocery', 'dmart', 'market', 'store', 'mart', 'fruit', 'vegetable'],
    HOTEL: ['hotel', 'lodge', 'resort', 'stay'],
    SHOPPING: ['cloth', 'apparel', 'mall', 'amazon', 'flipkart'],
    MEDICAL: ['pharmacy', 'medical', 'hospital', 'clinic', 'doctor']
  };

  const t = text.toLowerCase();
  for (const [cat, keys] of Object.entries(categories)) {
    if (keys.some(k => t.includes(k))) return cat;
  }
  return 'Other';
};

const extractMerchant = (text) => {
  // Heuristic: The merchant name is usually the first non-empty line
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // Skip lines that are just dates or "Receipt" headers if possible
  const ignore = ['receipt', 'tax invoice', 'bill of supply', 'invoice'];
  
  for (let i = 0; i < Math.min(lines.length, 3); i++) {
     if (!ignore.some(ign => lines[i].toLowerCase().includes(ign))) {
         return lines[i];
     }
  }
  return lines[0] || '';
};

const extractInvoiceNumber = (text) => {
  const regex = /(?:INV|INVOICE|BILL|TXN|TRANSACTION|RECEIPT|REF)\s*(?:NO|ID)?\s*[:#=]?\s*([A-Z0-9/-]{4,})/i;
  const match = text.match(regex);
  return match ? match[1] : '';
};

const extractPaymentMethod = (text) => {
  const t = text.toLowerCase();
  if (t.includes('cash')) return 'CASH';
  if (t.includes('card') || t.includes('visa') || t.includes('mastercard')) return 'CARD';
  return 'UPI';
};

