import "server-only";
import QRCode from "qrcode";

// FITRON's own UPI collection: the gym scans a QR for FITRON's UPI ID with any UPI app, pays,
// and types the UTR (the 12-digit UPI reference). The FITRON team checks it against the bank
// statement and confirms. Without FITRON_UPI_ID, billing falls back to Razorpay or demo mode.

const env = (k: string) => process.env[k]?.trim() || "";

/** FITRON's UPI ID and the name shown in the payer's app, or null when not set. */
export function fitronUpi() {
  const id = env("FITRON_UPI_ID");
  return id ? { id, name: env("FITRON_UPI_NAME") || "FITRON" } : null;
}

/** A standard UPI payment link (NPCI deep link) with the amount filled in. Amount in paise.
 *  The @ in the UPI ID stays as it is: some UPI apps reject an ID written as name%40bank. */
export function upiLink(a: { id: string; name: string; amount: number; note: string }) {
  const q = new URLSearchParams({ pa: a.id, pn: a.name, am: (a.amount / 100).toFixed(2), cu: "INR", tn: a.note });
  return `upi://pay?${q.toString().replace(/\+/g, "%20").replace(/%40/g, "@")}`;
}

/** The link as an SVG QR code, safe to inline. */
export const qrSvg = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

/** A UPI UTR / RRN is 12 digits. Spaces people copy along with it are ignored. */
export function cleanUtr(raw: string) {
  const s = raw.replace(/\s+/g, "");
  return /^\d{12}$/.test(s) ? s : null;
}

/** Emails of the FITRON team who confirm UPI payments (FITRON_ADMIN_EMAILS, comma separated). */
export const fitronAdmins = () =>
  env("FITRON_ADMIN_EMAILS")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isFitronAdmin = (email: string) => fitronAdmins().includes(email.toLowerCase());
