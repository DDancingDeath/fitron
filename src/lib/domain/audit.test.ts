import { describe, expect, it } from "vitest";
import { entitiesOf, moduleOf, severityOf } from "./audit";

describe("audit severity and modules", () => {
  it("rates reversals, deletions and unlocks high, edits medium, the rest low", () => {
    expect(severityOf("payment.reverse")).toBe("High");
    expect(severityOf("member.delete")).toBe("High");
    expect(severityOf("month.unlock")).toBe("High");
    expect(severityOf("member.update")).toBe("Medium");
    expect(severityOf("month.lock")).toBe("Medium");
    expect(severityOf("member.create")).toBe("Low");
    expect(severityOf("export.members", "Member")).toBe("Low");
  });
  it("rates a restore high, as the prototype does, and files backups under Settings", () => {
    expect(severityOf("backup.restore")).toBe("High");
    expect(severityOf("member.restore")).toBe("High");
    expect(severityOf("backup.create")).toBe("Low");
    expect(severityOf("backup.prune")).toBe("Low");
    expect(moduleOf("Backup")).toBe("Settings");
  });
  it("groups record types into the prototype's modules", () => {
    expect(moduleOf("Payment")).toBe("Payments");
    expect(moduleOf("MembershipPlan")).toBe("Settings");
    expect(moduleOf("Expense")).toBe("Accounts");
    expect(moduleOf("Something")).toBe("Other");
    expect(entitiesOf("Invoices")).toEqual(["Invoice"]);
  });
});
