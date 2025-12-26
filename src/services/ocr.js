import { Ocr } from '@capacitor-community/image-to-text';

/**
 * OCR + data extraction.
 * imageSrc:
 *   - native file path (CameraResultType.Uri -> photo.path/webPath)
 *   - OR data URL (from PDF canvas / web).
 */
export const analyzeImage = async (imageSrc) => {
  if (!imageSrc) {
    throw new Error('Unable to prepare image for analysis (source empty).');
  }

  try {
    console.log('OCR starting with src:', imageSrc);

    let options;

    if (imageSrc.startsWith('data:')) {
      const base64 = imageSrc.split(',')[1];
      console.log('Using base64, length:', base64 ? base64.length : 0);
      if (!base64 || base64.length < 100) {
        throw new Error(
          'Unable to prepare image for analysis (corrupted data).',
        );
      }
      options = { base64 };
    } else {
      console.log('Using filename:', imageSrc);
      options = { filename: imageSrc };
    }

    const { textDetections } = await Ocr.detectText(options);

    // No text → allow manual entry
    if (!textDetections || textDetections.length === 0) {
      return {
        text: '',
        amount: '',
        merchant: '',
        date: new Date().toISOString().split('T')[0],
        category: 'Other',
        invoice_number: '',
        payment_method: 'UPI',
        hasFields: false,
      };
    }

    const fullText = textDetections.map((d) => d.text).join('
');
    console.log('ML Kit Processed Text:', fullText);

    const amount = extractAmount(fullText);
    const merchant = extractMerchant(fullText);
    const dateResult = extractDate(fullText);
    const date = dateResult || new Date().toISOString().split('T')[0];

    const isLikelyReceipt = !!(amount || merchant);

    return {
      text: fullText,
      amount,
      merchant,
      date,
      category: extractCategory(fullText),
      invoice_number: extractInvoiceNumber(fullText),
      payment_method: extractPaymentMethod(fullText),
      hasFields: isLikelyReceipt,
    };
  } catch (error) {
    console.error('ML Kit OCR Error:', error);

    const msg = error && error.message ? error.message : '';

    if (msg.includes('permission') || msg.includes('access')) {
      throw new Error(
        'Permission required to read file. Please check settings.',
      );
    }

    if (msg.includes('corrupted data') || msg.includes('source empty')) {
      throw error;
    }

    // For native codes like "ocr_failed", show friendly message
    throw new Error(
      'OCR failed on this file. Try again with a clearer image or different file.',
    );
  }
};

// -------- Extraction helpers --------

const extractAmount = (text) => {
  const amountRegex =
    /(?:RS|INR|₹|TOTAL|AMOUNT|AMT)s*[:=]?s*(d{1,3}(?:[.,]d{3})*(?:[.,]d{2}))/gi;
  const matches = [...text.matchAll(amountRegex)];

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1][1];
    return lastMatch.replace(/,/g, '');
  }

  const priceRegex = /\bd{1,5}[.,]d{2}\b/g;
  const prices = text.match(priceRegex);
  if (prices) {
    return prices
      .reduce((max, curr) => {
        const val = parseFloat(curr.replace(/,/g, ''));
        return val > parseFloat(max.replace(/,/g, '')) ? curr : max;
      })
      .replace(/,/g, '');
  }

  return '';
};

const extractDate = (text) => {
  const dateRegex =
    /(d{1,2})[/-](d{1,2})[/-](d{2,4})|(d{4})[/-](d{1,2})[/-](d{1,2})/;
  const match = text.match(dateRegex);

  if (match) {
    let y, m, d;
    if (match[1]) {
      d = match[1].padStart(2, '0');
      m = match[2].padStart(2, '0');
      y = match[3];
      if (y.length === 2) y = '20' + y;
    } else {
      y = match[4];
      m = match[5].padStart(2, '0');
      d = match[6].padStart(2, '0');
    }
    return `${y}-${m}-${d}`;
  }
  return null;
};

const extractCategory = (text) => {
  const categories = {
    FOOD: [
      'food',
      'restaurant',
      'cafe',
      'swiggy',
      'zomato',
      'eat',
      'lunch',
      'dinner',
      'burger',
      'pizza',
      'biryani',
    ],
    TRAVEL: [
      'uber',
      'ola',
      'taxi',
      'cab',
      'metro',
      'auto',
      'train',
      'flight',
      'bus',
      'fuel',
      'petrol',
      'diesel',
    ],
    GROCERY: [
      'grocery',
      'dmart',
      'market',
      'milk',
      'vegetables',
      'kirana',
      'mart',
      'store',
      'mandi',
    ],
    HOTEL: ['hotel', 'lodge', 'resort', 'stay', 'inn'],
    'ROOM STAY': ['rent', 'pg', 'hostel', 'accommodation'],
  };

  const lowercaseText = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some((kw) => lowercaseText.includes(kw))) {
      return cat;
    }
  }
  return 'Other';
};

const extractMerchant = (text) => {
  const lines = text
    .split('
')
    .map((l) => l.trim())
    .filter((l) => l.length > 2);
  if (lines.length === 0) return '';

  const commonMerchants = [
    'GPay',
    'PhonePe',
    'Paytm',
    'Amazon',
    'Flipkart',
    'Jio',
    'Zomato',
    'Swiggy',
    'Uber',
    'Ola',
    'D-Mart',
    'Reliance',
  ];

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (
      commonMerchants.some((m) => lower.includes(m.toLowerCase())) &&
      !/d{10}/.test(line)
    ) {
      return line;
    }
  }

  return lines[0];
};

const extractInvoiceNumber = (text) => {
  const invoiceRegex =
    /(?:INV|INVOICE|BILL|TXN|TRANSACTION|RECEIPT|REF)s*(?:NO|ID|NUMBER)?s*[:#=]?s*([A-Z0-9/-]{4,})/i;
  const match = text.match(invoiceRegex);
  return match ? match[1] : '';
};

const extractPaymentMethod = (text) => {
  const lowercaseText = text.toLowerCase();
  if (
    lowercaseText.includes('upi') ||
    lowercaseText.includes('gpay') ||
    lowercaseText.includes('phonepe')
  )
    return 'UPI';
  if (lowercaseText.includes('cash')) return 'CASH';
  if (
    lowercaseText.includes('card') ||
    lowercaseText.includes('visa') ||
    lowercaseText.includes('mastercard') ||
    lowercaseText.includes('swipe')
  )
    return 'CARD';
  return 'UPI';
};
