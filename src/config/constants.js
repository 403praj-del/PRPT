export const FORM_CONFIG = {
    formUrl: "https://docs.google.com/forms/u/0/d/e/1FAIpQLSffdtbhXtg4knRt47GmAMH1F3HE-V3Slm4LY2-PPi4AapIqdw/formResponse",
    fields: {
        category: "entry.523033456",       // EXPENSE TYPE
        date: "entry.926892012",           // EXPENSE DATE
        amount: "entry.719826681",         // AMOUNT IN INR
        merchant: "entry.243879780",       // MERCHANT
        invoice_number: "entry.968931037"  // INVOICE NUMBER
    },
    categories: [
        "HOTEL",
        "TRAVEL",
        "FOOD",
        "TOUR",
        "ROOM STAY",
        "GLOCERY",
        "Other"
    ],
    // The new form doesn't seem to have a dedicated 'Payment Method' radio yet, 
    // but the user requested tracking for GPay/PhonePe/Paytm in the Merchant field.
    paymentMethods: [
        "UPI",
        "CASH",
        "CARD"
    ]
};
