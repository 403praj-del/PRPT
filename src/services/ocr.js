import { Ocr } from '@capacitor-community/image-to-text';

/**
 * Robust OCR and Data Extraction using Google ML Kit (via Capacitor Community Plugin)
 */
export const analyzeImage = async (imageSrc) => {
    try {
        console.log("OCR starting...");
        if (!imageSrc) throw new Error("No image data provided.");

        // Handle base64 from webcam or image path
        const isBase64 = imageSrc.startsWith('data:');
        const options = isBase64
            ? { base64: imageSrc.split(',')[1] }
            : { filename: imageSrc };

        const { textDetections } = await Ocr.detectText(options);

        if (!textDetections || textDetections.length === 0) {
            throw new Error("No text detected in the image. Please try a clearer photo.");
        }

        // Join all detected blocks into full text
        const text = textDetections.map(d => d.text).join('\n');
        console.log("ML Kit Combined Text:", text);

        return {
            text: text,
            amount: extractAmount(text),
            date: extractDate(text),
            category: extractCategory(text),
            merchant: extractMerchant(text),
            invoice_number: extractInvoiceNumber(text),
            payment_method: extractPaymentMethod(text)
        };
    } catch (error) {
        console.error("ML Kit OCR Error:", error);

        // Strategic error messages
        if (error.message?.includes('permission')) {
            throw new Error("Storage/Camera permission not granted. Please allow access in settings.");
        }
        if (error.message?.includes('No text detected')) {
            throw error;
        }
        throw new Error("Failed to process image. Ensure it's a valid receipt or invoice.");
    }
};

const extractAmount = (text) => {
    // Look for ₹, Rs, INR, or just large numbers near 'Total'
    // Regex for: (Rs|INR|₹)?\s?(\d{1,3}(,\d{3})*(\.\d{2})?)
    const amountRegex = /(?:RS|INR|₹|TOTAL|AMOUNT)\s*[:=]?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/gi;
    let matches = [...text.matchAll(amountRegex)];

    if (matches.length > 0) {
        // Return the last match often which is the TOTAL
        const lastMatch = matches[matches.length - 1][1];
        return lastMatch.replace(/,/g, '');
    }

    // Fallback: look for any number that looks like a price
    const priceRegex = /\d{1,3}(?:,\d{3})*\.\d{2}/g;
    const prices = text.match(priceRegex);
    if (prices) {
        return prices.reduce((a, b) => parseFloat(a.replace(/,/g, '')) > parseFloat(b.replace(/,/g, '')) ? a : b).replace(/,/g, '');
    }

    return "";
};

const extractDate = (text) => {
    // Various date formats: DD/MM/YYYY, DD-MM-YY, YYYY-MM-DD
    const dateRegex = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})|(\d{4})[/-](\d{1,2})[/-](\d{1,2})/;
    const match = text.match(dateRegex);

    if (match) {
        if (match[1]) { // DD/MM/YYYY or DD-MM-YY
            let d = match[1].padStart(2, '0');
            let m = match[2].padStart(2, '0');
            let y = match[3];
            if (y.length === 2) y = "20" + y;
            return `${y}-${m}-${d}`;
        } else if (match[4]) { // YYYY-MM-DD
            let y = match[4];
            let m = match[5].padStart(2, '0');
            let d = match[6].padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
    return new Date().toISOString().split('T')[0];
};

const extractCategory = (text) => {
    const categories = {
        "FOOD": ["food", "restaurant", "cafe", "dining", "swiggy", "zomato", "eat", "lunch", "dinner", "breakfast"],
        "TRAVEL": ["uber", "ola", "taxi", "cab", "metro", "auto", "train", "flight", "bus", "fuel", "petrol"],
        "HOTEL": ["hotel", "lodge", "resort", "stay", "inn", "suites"],
        "TOUR": ["tour", "sightseeing", "entry fee", "guide", "package"],
        "ROOM STAY": ["room rent", "pg", "accommodation", "hostel"],
        "GLOCERY": ["grocery", "dmart", "market", "milk", "vegetables", "kirana", "mart"]
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
    const merchants = ["GPay", "PhonePe", "Paytm", "RedBus", "MakeMyTrip", "DMart", "Jio Store", "Amazon", "Flipkart", "Uber", "Ola"];
    const lowercaseText = text.toLowerCase();

    for (const m of merchants) {
        if (lowercaseText.includes(m.toLowerCase())) {
            return m;
        }
    }

    // Attempt to find the first line or a name-like string if no known merchant found
    const lines = text.split('\n').filter(l => l.trim().length > 3);
    return lines.length > 0 ? lines[0].trim() : "";
};

const extractInvoiceNumber = (text) => {
    const invoiceRegex = /(?:INV|INVOICE|BILL|TXN|TRANSACTION)\s*(?:NO|ID|NUMBER)?\s*[:#=]?\s*([A-Z0-9/-]{4,})/i;
    const match = text.match(invoiceRegex);
    return match ? match[1] : "";
};

const extractPaymentMethod = (text) => {
    const lowercaseText = text.toLowerCase();
    if (lowercaseText.includes("upi") || lowercaseText.includes("scan")) return "UPI";
    if (lowercaseText.includes("cash")) return "CASH";
    if (lowercaseText.includes("card") || lowercaseText.includes("visa") || lowercaseText.includes("mastercard")) return "CARD";
    return "UPI"; // Default to UPI for India
};
