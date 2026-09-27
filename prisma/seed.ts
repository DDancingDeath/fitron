// Demo gym for development and previews. Sign in with any demo email and the
// password "fitron-demo". Never run this against a production database.
import { makeClient } from "./client";
import { ensureExpenseCategories, ensureRoles } from "./roles";
import { hashPassword } from "../src/lib/auth/password";
import { invoiceTotals } from "../src/lib/domain/billing";
import { addDays, addMonths } from "../src/lib/domain/dates";

const db = makeClient();
const DEMO_PASSWORD = "fitron-demo";

// Deterministic so every seed looks the same.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

const MALE = ["Rahul", "Amit", "Vikash", "Rohit", "Saurabh", "Ankit", "Manish", "Deepak", "Abhishek", "Gaurav", "Aditya", "Karan", "Suraj", "Nikhil", "Ravi"];
const FEMALE = ["Priya", "Sneha", "Anjali", "Pooja", "Neha", "Riya", "Kajal", "Shreya", "Nisha", "Swati", "Tanya", "Divya"];
const LAST = ["Kumar", "Singh", "Sharma", "Verma", "Gupta", "Mahto", "Das", "Sinha", "Jha", "Oraon", "Tudu", "Mishra"];
const AREAS = ["Sector 4", "Sector 9", "Chas", "City Centre", "Sector 12", "Naya More"];
const SOURCES = ["Walk-in", "Friend", "Instagram", "Google", "Flyer"];
const METHODS = ["UPI", "Cash", "Card", "UPI", "UPI"];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  // Roles and categories are refreshed every run, so older databases pick up new ones.
  const roles = await ensureRoles(db);
  await ensureExpenseCategories(db);
  const existing = await db.organization.findFirst({ where: { name: "Power Haus Gym (demo)" } });
  if (existing) {
    console.log("Demo gym already exists; roles and categories refreshed.");
    return;
  }
  const org = await db.organization.create({ data: { name: "Power Haus Gym (demo)" } });
  const [city, chas] = await Promise.all([
    db.branch.create({ data: { orgId: org.id, name: "City Centre", address: "C-7, Sector 4, City Centre, Bokaro", phone: "7319742490", gstin: "20ABCDE1234F1Z5" } }),
    db.branch.create({ data: { orgId: org.id, name: "Chas", address: "Main Road, Chas, Bokaro", phone: "7250981134" } }),
  ]);
  await db.setting.createMany({
    data: [
      { orgId: org.id, key: "gym", value: { name: "Power Haus Gym" } },
      { orgId: org.id, key: "numbering", value: { memberPrefix: "PHG-" } },
    ],
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const staff = [
    ["Sumit Kumar", "Super Admin", "sumit@demo.fitron.in", [city, chas]],
    ["Ritika Sinha", "Admin", "ritika@demo.fitron.in", [city]],
    ["Anand Verma", "Accountant", "accounts@demo.fitron.in", [city, chas]],
    ["Pooja Kumari", "Receptionist", "frontdesk@demo.fitron.in", [city]],
    ["Vikram Singh", "Trainer", "vikram@demo.fitron.in", [city]],
    ["Neha Das", "Receptionist", "chas@demo.fitron.in", [chas]],
    ["Meera Oraon", "Trainer", "meera@demo.fitron.in", [chas]],
  ] as const;
  const users: Record<string, string> = {};
  for (const [name, role, email, branches] of staff) {
    const u = await db.user.create({
      data: {
        orgId: org.id,
        name,
        email,
        phone: `9${ri(100000000, 999999999)}`,
        roleId: roles.get(role)!,
        passwordHash,
        ptRate: role === "Trainer" ? 40 : 0,
        branches: { create: branches.map((b) => ({ branchId: b.id })) },
      },
    });
    users[email] = u.id;
  }

  const planDefs = [
    ["Monthly", 1, 150000, 50000, "Membership", ["Gym floor", "Locker", "Fitness assessment"]],
    ["Quarterly", 3, 400000, 50000, "Membership", ["Gym floor", "Locker", "Diet chart"]],
    ["Half-Yearly", 6, 750000, 50000, "Membership", ["Gym floor", "Locker", "Diet chart", "Body composition"]],
    ["Annual", 12, 1300000, 0, "Membership", ["Gym floor", "Locker", "Diet chart", "2 PT sessions"]],
    ["Personal Training", 1, 500000, 0, "Personal Training", ["12 PT sessions", "Custom program", "Diet plan"]],
    ["Student Monthly", 1, 120000, 30000, "Membership", ["Gym floor", "Off-peak hours"]],
  ] as const;
  const plans = [];
  for (const [name, months, price, regFee, kind, features] of planDefs) {
    plans.push(await db.membershipPlan.create({ data: { orgId: org.id, name, months, price, regFee, kind, features: [...features] } }));
  }
  await db.membershipPlan.create({
    data: { orgId: org.id, name: "Monsoon Offer 2025", months: 2, price: 250000, regFee: 0, kind: "Membership", status: "INACTIVE", features: ["Gym floor"] },
  });

  let memberNo = 1001;
  let invNo = 1001;
  let payNo = 5001;
  let msNo = 1;
  const trainers = [users["vikram@demo.fitron.in"], users["meera@demo.fitron.in"]];
  const creator = users["frontdesk@demo.fitron.in"]!;

  for (let i = 0; i < 48; i++) {
    const female = rnd() < 0.4;
    const branch = i % 4 === 3 ? chas : city;
    const plan = pick(plans.slice(0, 4));
    // Spread end dates from 40 days ago to 5 months ahead so every status shows up.
    const end = addDays(today, ri(-40, plan.months * 30));
    const start = addMonths(addDays(end, 1), -plan.months);
    const m = await db.member.create({
      data: {
        orgId: org.id,
        branchId: branch.id,
        code: `PHG-${memberNo++}`,
        name: `${pick(female ? FEMALE : MALE)} ${pick(LAST)}`,
        gender: female ? "Female" : "Male",
        phone: `${pick(["6", "7", "8", "9"])}${String(ri(100000000, 999999999))}`,
        area: pick(AREAS),
        city: "Bokaro",
        state: "Jharkhand",
        source: pick(SOURCES),
        tags: [],
        trainerId: rnd() < 0.5 ? (branch === city ? trainers[0] : trainers[1]) : null,
        suspended: i === 7,
        createdById: creator,
        createdAt: d(start),
      },
    });
    const lines = [
      { qty: 1, rate: plan.price, discount: 0, taxRate: 18 },
      ...(plan.regFee ? [{ qty: 1, rate: plan.regFee, discount: 0, taxRate: 18 }] : []),
    ];
    const t = invoiceTotals(lines);
    const inv = await db.invoice.create({
      data: {
        orgId: org.id,
        branchId: branch.id,
        memberId: m.id,
        number: `INV-${invNo++}`,
        date: d(start),
        dueDate: d(start),
        ...t,
        gstType: "CGST+SGST",
        gstRate: 18,
        status: "ISSUED",
        createdById: creator,
        items: {
          create: lines.map((l, k) => ({
            description: k === 0 ? `${plan.name} membership` : "Registration fee",
            qty: l.qty,
            rate: l.rate,
            discount: l.discount,
            taxRate: l.taxRate,
            taxAmount: Math.round(((l.rate - l.discount) * l.taxRate) / 100),
            amount: l.rate - l.discount,
            category: k === 0 ? "New Membership" : "Registration",
            planId: k === 0 ? plan.id : null,
          })),
        },
      },
    });
    await db.membership.create({
      data: {
        code: `MS-${msNo++}`,
        memberId: m.id,
        planId: plan.id,
        branchId: branch.id,
        type: "NEW",
        startDate: d(start),
        endDate: d(end),
        price: plan.price,
        discount: 0,
        pricingCategory: "Standard",
        invoiceId: inv.id,
      },
    });
    // Most pay in full; some part-pay; a few owe everything.
    const r = rnd();
    const paid = r < 0.75 ? t.total : r < 0.9 ? Math.round(t.total / 2 / 100) * 100 : 0;
    if (paid > 0) {
      await db.payment.create({
        data: {
          orgId: org.id,
          branchId: branch.id,
          invoiceId: inv.id,
          memberId: m.id,
          code: `PAY-${payNo++}`,
          date: d(start),
          amount: paid,
          method: pick(METHODS),
          receivedById: creator,
        },
      });
    }
  }
  await db.sequence.createMany({
    data: [
      { orgId: org.id, name: "member", next: memberNo },
      { orgId: org.id, name: "invoice", next: invNo },
      { orgId: org.id, name: "payment", next: payNo },
      { orgId: org.id, name: "membership", next: msNo },
    ],
  });
  console.log(`Seeded the demo gym. Sign in as sumit@demo.fitron.in with password "${DEMO_PASSWORD}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
