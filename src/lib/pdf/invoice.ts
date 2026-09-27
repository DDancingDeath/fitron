import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { formatInr } from "@/lib/domain/billing";

const FONT_DIR = path.join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf");
let fonts: Promise<[Uint8Array, Uint8Array]> | undefined;
const loadFonts = () =>
  (fonts ??= Promise.all([readFile(path.join(FONT_DIR, "DejaVuSans.ttf")), readFile(path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))]));

export type InvoicePdfData = {
  gym: { name: string; address: string; phone: string; gstin?: string | null; sac?: string };
  number: string;
  date: string;
  dueDate: string;
  status: string;
  member: { name: string; code: string; phone: string; address?: string };
  items: { description: string; qty: number; rate: number; discount: number; taxRate: number; amount: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  gstType: string | null;
  gstRate: number | null;
  payments: { code: string; date: string; method: string; amount: number; reversed: boolean }[];
  membership?: { plan: string; start: string; end: string } | null;
};

const INK = rgb(0.12, 0.11, 0.08);
const MUTED = rgb(0.43, 0.4, 0.34);
const GOLD = rgb(0.54, 0.4, 0.07);
const LINE = rgb(0.89, 0.88, 0.85);

/** A4 GST invoice. Same content as the invoice screen. */
export async function renderInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regBytes, boldBytes] = await loadFonts();
  const reg = await doc.embedFont(regBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  doc.setTitle(`Invoice ${d.number}`);
  doc.setAuthor(d.gym.name);

  let page = doc.addPage([595.28, 841.89]);
  const M = 48;
  const W = page.getWidth() - M * 2;
  let y = page.getHeight() - M;

  const text = (p: PDFPage, s: string, x: number, yy: number, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" } = {}) => {
    const font = o.font ?? reg;
    const size = o.size ?? 10;
    const w = font.widthOfTextAtSize(s, size);
    p.drawText(s, { x: o.align === "right" ? x - w : x, y: yy, size, font, color: o.color ?? INK });
  };

  // Header
  text(page, d.gym.name, M, y - 4, { font: bold, size: 18 });
  text(page, "TAX INVOICE", M + W, y - 2, { font: bold, size: 12, color: GOLD, align: "right" });
  y -= 22;
  for (const l of [d.gym.address, `Phone ${d.gym.phone}`, d.gym.gstin ? `GSTIN ${d.gym.gstin}` : ""].filter(Boolean)) {
    text(page, l, M, y, { size: 9, color: MUTED });
    y -= 12;
  }
  let ry = page.getHeight() - M - 20;
  for (const [k, v] of [["Invoice no.", d.number], ["Date", d.date], ["Due", d.dueDate], ["Status", d.status]]) {
    text(page, k, M + W - 110, ry, { size: 9, color: MUTED });
    text(page, v, M + W, ry, { size: 9, font: bold, align: "right" });
    ry -= 12;
  }
  y = Math.min(y, ry) - 16;

  // Bill to
  text(page, "BILL TO", M, y, { size: 8, color: MUTED });
  y -= 14;
  text(page, d.member.name, M, y, { font: bold, size: 11 });
  y -= 13;
  text(page, `${d.member.code} · ${d.member.phone}`, M, y, { size: 9, color: MUTED });
  if (d.member.address) {
    y -= 12;
    text(page, d.member.address, M, y, { size: 9, color: MUTED });
  }
  if (d.membership) {
    y -= 12;
    text(page, `Membership: ${d.membership.plan}, ${d.membership.start} to ${d.membership.end}`, M, y, { size: 9, color: MUTED });
  }
  y -= 24;

  // Items
  const cols = [
    { label: "Description", x: M, align: "left" as const },
    { label: "Qty", x: M + W - 250, align: "right" as const },
    { label: "Rate", x: M + W - 180, align: "right" as const },
    { label: "Discount", x: M + W - 115, align: "right" as const },
    { label: "GST", x: M + W - 70, align: "right" as const },
    { label: "Amount", x: M + W, align: "right" as const },
  ];
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: M + W, y: yy }, thickness: 0.7, color: LINE });
  for (const c of cols) text(page, c.label, c.x, y, { size: 8, color: MUTED, align: c.align });
  y -= 8;
  rule(y);
  y -= 16;
  for (const it of d.items) {
    if (y < 160) {
      page = doc.addPage([595.28, 841.89]);
      y = page.getHeight() - M;
    }
    const cells = [it.description, String(it.qty), formatInr(it.rate), it.discount ? formatInr(it.discount) : "—", it.taxRate ? `${it.taxRate}%` : "—", formatInr(it.amount)];
    cells.forEach((c, i) => text(page, c, cols[i]!.x, y, { size: 9.5, align: cols[i]!.align }));
    y -= 10;
    rule(y);
    y -= 16;
  }

  // Totals
  const tl = M + W - 200;
  const row = (k: string, v: string, strong = false) => {
    text(page, k, tl, y, { size: strong ? 11 : 9.5, font: strong ? bold : reg, color: strong ? INK : MUTED });
    text(page, v, M + W, y, { size: strong ? 11 : 9.5, font: strong ? bold : reg, align: "right" });
    y -= strong ? 18 : 14;
  };
  row("Subtotal", formatInr(d.subtotal));
  if (d.discount) row("Discount", `− ${formatInr(d.discount)}`);
  if (d.tax) {
    if (d.gstType === "CGST+SGST") {
      const half = Math.floor(d.tax / 2);
      row(`CGST (${(d.gstRate ?? 0) / 2}%)`, formatInr(half));
      row(`SGST (${(d.gstRate ?? 0) / 2}%)`, formatInr(d.tax - half));
    } else row(`IGST (${d.gstRate ?? 0}%)`, formatInr(d.tax));
  }
  row("Total", formatInr(d.total), true);
  row("Paid", formatInr(d.paid));
  row("Balance due", formatInr(d.balance), true);

  if (d.payments.length) {
    y -= 10;
    text(page, "PAYMENTS", M, y, { size: 8, color: MUTED });
    y -= 14;
    for (const p of d.payments) {
      text(page, `${p.date} · ${p.code} · ${p.method}${p.reversed ? " · reversed" : ""}`, M, y, { size: 9, color: p.reversed ? MUTED : INK });
      text(page, formatInr(p.amount), M + 260, y, { size: 9, align: "right", color: p.reversed ? MUTED : INK });
      y -= 13;
    }
  }

  const foot = d.gym.sac ? `SAC ${d.gym.sac} · ` : "";
  text(page, `${foot}This is a computer-generated invoice.`, M, M - 10, { size: 8, color: MUTED });
  return doc.save();
}
