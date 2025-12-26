import { Ocr } from '@capacitor-community/image-to-text';

/**
 * Robust OCR and Data Extraction using Google ML Kit.
 * @param {string} imageSrc - Base64 or local path.
 */
export const analyzeImage = async (imageSrc) => {
    if (!imageSrc) {
        throw new Error("Unable to prepare image for analysis (source empty).");
    }

    try {
        console.log("OCR starting...");

        // Validation Guard: Ensure valid base64 if applicable
        if (imageSrc.startsWith('data:') && imageSrc.length < 100) {
            throw new Error("Unable to prepare image for analysis (corrupted data).");
        }

        const isBase64 = imageSrc.startsWith('data:');
        const options = isBase64
            ? { base64: imageSrc.split(',')[1] }
            : { filename: imageSrc };

        const { textDetections } = await Ocr.detectText(options);

        // Case 1: No text detected at all
        if (!textDetections || textDetections.length === 0) {
            throw new Error("No readable text detected. Ensure the image is focused and contains text.");
        }

        const fullText = textDetections.map(d => d.text).join('\n');
        console.log("ML Kit Processed Text:", fullText);

        const amount = extractAmount(fullText);
        const merchant = extractMerchant(fullText);
        const dateResult = extractDate(fullText);
        const date = dateResult ? dateResult : new Date().toISOString().split('T')[0];

        // Case 2: Text detected, but is it a receipt?
        const isLikelyReceipt = !!(amount || merchant);

        return {
            text: fullText,
            amount,
            merchant,
            date,
            category: extractCategory(fullText),
            invoice_number: extractInvoiceNumber(fullText),
            payment_method: extractPaymentMethod(fullText),
            hasFields: isLikelyReceipt
        };
    } catch (error) {
        console.error("ML Kit OCR Error:", error);

        const msg = error.message || "";

        // Specific Error Mapping
        if (msg.includes('permission') || msg.includes('access')) {
            throw new Error("Permission required to read file. Please check settings.");
        }

        if (msg.includes('No readable text') || msg.includes('prepare')) {
            throw error;
        }

        throw new Error("ML Kit failed to analyze this image. Try taking a photo from a different angle.");
    }
};

const extractAmount = (text) => {
    // Regex for: (Currency Symbol/Label)?\s*(Number with decimals)
    // Supports ₹, Rs, INR, Total, Amount
    const amountRegex = /(?:RS|INR|₹|TOTAL|AMOUNT|AMT)\s*[:=]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/gi;
    let matches = [...text.matchAll(amountRegex)];

    if (matches.length > 0) {
        // Return the highest value found near "TOTAL"
        const lastMatch = matches[matches.length - 1][1];
        return lastMatch.replace(/,/g, '');
    }

    // Fallback: search for any price-like format as a last resort
    const priceRegex = /\b\d{1,5}[.,]\d{2}\b/g;
    const prices = text.match(priceRegex);
    if (prices) {
        return prices.reduce((max, curr) => {
            const val = parseFloat(curr.replace(/,/g, ''));
            return val > parseFloat(max.replace(/,/g, '')) ? curr : max;
        }).replace(/,/g, '');
    }

    return "";
};

const extractDate = (text) => {
    const dateRegex = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})|(\d{4})[/-](\d{1,2})[/-](\d{1,2})/;
    const match = text.match(dateRegex);

    if (match) {
        let y, m, d;
        if (match[1]) { // DD/MM/YYYY
            d = match[1].padStart(2, '0');
            m = match[2].padStart(2, '0');
            y = match[3];
            if (y.length === 2) y = "20" + y;
        } else if (match[4]) { // YYYY-MM-DD
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
        "FOOD": ["food", "restaurant", "cafe", "swiggy", "zomato", "eat", "lunch", "dinner", "burger", "pizza", "biryani"],
        "TRAVEL": ["uber", "ola", "taxi", "cab", "metro", "auto", "train", "flight", "bus", "fuel", "petrol", "diesel"],
        "GLOCERY": ["grocery", "dmart", "market", "milk", "vegetables", "kirana", "mart", "store", "mandi"],
        "HOTEL": ["hotel", "lodge", "resort", "stay", "inn"],
        "ROOM STAY": ["rent", "pg", "hostel", "accommodation"]
    };

    const lowercaseText = text.toLowerCase();
    for (const [cat, keywords] of Object.entries(categories)) {
        if (keywords.some(kw => lowercaseText.includes(kw))) {
            return cat;
        }
    }
    return "Other";
};

const extractMerchant = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    if (lines.length === 0) return "";

    // Merchants usually appear in the first 3 lines
    const commonMerchants = ["GPay", "PhonePe", "Paytm", "Amazon", "Flipkart", "Jio", "Zomato", "Swiggy", "Uber", "Ola", "D-Mart", "Reliance"];
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
        const line = lines[i];
        if (commonMerchants.some(m => line.toLowerCase().includes(m.toLowerCase()))) {
            return line;
        }
    }

    // Default to the very first readable line (often the shop name)
    return lines[0];
};

const extractInvoiceNumber = (text) => {
    const invoiceRegex = /(?:INV|INVOICE|BILL|TXN|TRANSACTION|RECEIPT|REF)\s*(?:NO|ID|NUMBER)?\s*[:#=]?\s*([A-Z0-9/-]{4,})/i;
    const match = text.match(invoiceRegex);
    return match ? match[1] : "";
};

const extractPaymentMethod = (text) => {
    const lowercaseText = text.toLowerCase();
    if (lowercaseText.includes("upi") || lowercaseText.includes("gpay") || lowercaseText.includes("phonepe")) return "UPI";
    if (lowercaseText.includes("cash")) return "CASH";
    if (lowercaseText.includes("card") || lowercaseText.includes("visa") || lowercaseText.includes("mastercard") || lowercaseText.includes("swipe")) return "CARD";
    return "UPI";
};
