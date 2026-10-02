/** How serious an audit entry is, from its action, as in the prototype's audit log. */
export type Severity = "High" | "Medium" | "Low";

/** Reversals, cancellations, deletions, unlocks, overrides and role or access changes. */
export const HIGH_WORDS = ["reverse", "cancel", "delete", "remove", "unlock", "void", "override", "role", "deactivate", "erase"];
/** Edits to existing records, locks and settings. */
export const MEDIUM_WORDS = ["update", "lock", "setting", "restore", "suspend", "price", "transfer"];

export function severityOf(action: string, entity = ""): Severity {
  const a = `${action} ${entity}`.toLowerCase();
  if (HIGH_WORDS.some((w) => a.includes(w))) return "High";
  if (MEDIUM_WORDS.some((w) => a.includes(w))) return "Medium";
  return "Low";
}

const MODULES: [string, string[]][] = [
  ["Members", ["Member", "Membership", "Document", "ProgressLog"]],
  ["Invoices", ["Invoice"]],
  ["Payments", ["Payment", "AutopayMandate"]],
  ["Accounts", ["Expense", "MonthLock", "Asset", "Purchase"]],
  ["Attendance", ["Attendance", "ClassSlot", "Booking"]],
  ["POS", ["Product"]],
  ["Leads", ["Lead"]],
  ["Staff & devices", ["User", "Role", "Device"]],
  ["Settings", ["Setting", "Branch", "MembershipPlan", "Offer", "WhatsAppTemplate"]],
];

/** The prototype's module for a record type. */
export const moduleOf = (entity: string) => MODULES.find(([, es]) => es.includes(entity))?.[0] ?? "Other";
/** Record types in a module. */
export const entitiesOf = (module: string) => MODULES.find(([m]) => m === module)?.[1] ?? [];
export const AUDIT_MODULES = [...MODULES.map(([m]) => m), "Other"];
