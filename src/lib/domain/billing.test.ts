import { describe, expect, it } from "vitest";
import { formatInr, invoiceState, invoiceTotals } from "./billing";

const plan = { qty: 1, rate: 300_000, discount: 20_000, taxRate: 18 };
const regFee = { qty: 1, rate: 50_000, discount: 0, taxRate: 18 };

describe("invoiceTotals", () => {
  it("applies GST after the line discount", () => {
    // (3000 − 200) + 500 = 3300 taxable; 18% = 594
    expect(invoiceTotals([plan, regFee])).toEqual({
      subtotal: 350_000,
      discount: 20_000,
      tax: 59_400,
      total: 389_400,
    });
  });

  it("rounds tax once for the whole invoice", () => {
    const line = { qty: 1, rate: 1, discount: 0, taxRate: 18 };
    expect(invoiceTotals([line, line, line]).tax).toBe(1); // 0.54 rounds to 1, not 3 × 0
  });
});

describe("invoiceState", () => {
  const invoice = { total: 389_400, cancelled: false, dueDate: "2026-09-20" };

  it("is UNPAID with no payments and counts overdue days", () => {
    expect(invoiceState(invoice, [], "2026-09-27")).toEqual({
      paid: 0,
      balance: 389_400,
      status: "UNPAID",
      overdueDays: 7,
    });
  });

  it("is PARTIALLY_PAID after a part payment", () => {
    const s = invoiceState(invoice, [{ amount: 100_000, status: "SUCCESS" }], "2026-09-10");
    expect(s).toMatchObject({ status: "PARTIALLY_PAID", balance: 289_400, overdueDays: 0 });
  });

  it("becomes PAID once the balance is collected", () => {
    const s = invoiceState(
      invoice,
      [
        { amount: 100_000, status: "SUCCESS" },
        { amount: 289_400, status: "SUCCESS" },
      ],
      "2026-09-27",
    );
    expect(s).toMatchObject({ status: "PAID", balance: 0, overdueDays: 0 });
  });

  it("ignores reversed payments", () => {
    const s = invoiceState(invoice, [{ amount: 389_400, status: "REVERSED" }], "2026-09-10");
    expect(s).toMatchObject({ status: "UNPAID", paid: 0, balance: 389_400 });
  });

  it("has no balance once cancelled", () => {
    const s = invoiceState({ ...invoice, cancelled: true }, [], "2026-09-27");
    expect(s).toEqual({ paid: 0, balance: 0, status: "CANCELLED", overdueDays: 0 });
  });
});

describe("formatInr", () => {
  it("uses Indian digit grouping", () => {
    expect(formatInr(123_456_789)).toBe("₹12,34,567.89");
  });
});
