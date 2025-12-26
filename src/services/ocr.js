/**
 * SAFE OCR SERVICE (TEMPORARY – NO NATIVE CALLS)
 * --------------------------------------------
 * This prevents Android native crashes.
 * Manual entry will always work.
 */

export const analyzeImage = async () => {
  return {
    text: "",
    amount: "",
    merchant: "",
    date: new Date().toISOString().split("T")[0],
    category: "Other",
    invoice_number: "",
    payment_method: "UPI",
    hasFields: false
  };
};
