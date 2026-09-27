import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hasDb, makeGym, pick } from "@/test/db";
import { addDays } from "@/lib/domain/dates";
import { createMember, deleteMember } from "./members";
import { createPlan } from "./plans";
import { sellMembership } from "./billing";
import { enrol, saveDevice, syncDevices, unseal } from "./biometric";
import { todayIso } from "./time";
import { GET as cdataGet, POST as cdataPost } from "@/app/iclock/cdata/route";
import { GET as poll } from "@/app/iclock/getrequest/route";
import { POST as ack } from "@/app/iclock/devicecmd/route";

const base = "http://gym.test/iclock";
const call = async (fn: (r: Request) => Promise<Response>, path: string, body?: string) => {
  const res = await fn(new Request(`${base}/${path}`, body === undefined ? {} : { method: "POST", body }));
  return { status: res.status, text: await res.text() };
};

describe.skipIf(!hasDb)("Biometric door devices (database)", () => {
  let gym: Awaited<ReturnType<typeof makeGym>>;
  let admin: Awaited<ReturnType<Awaited<ReturnType<typeof makeGym>>["user"]>>;
  let active: string;
  let lapsed: string;
  const serial = `T${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const today = todayIso();

  beforeAll(async () => {
    gym = await makeGym();
    admin = pick(await gym.user("Super Admin"), gym.a.id);
    const plan = await createPlan(admin, { name: "Monthly", kind: "Membership", months: 1, price: 100000, regFee: 0, discount: 0, gstApplicable: false, features: [] });
    const a = await createMember(admin, { name: "Asha Active", gender: "Female", phone: "9855500001", source: "Walk-in", tags: [] });
    const b = await createMember(admin, { name: "Lalit Lapsed", gender: "Male", phone: "9855500002", source: "Walk-in", tags: [] });
    active = a.id;
    lapsed = b.id;
    await sellMembership(admin, a.id, { planId: plan.id, startDate: addDays(today, -5), discount: 0, includeRegFee: true, payAmount: 100000, payMethod: "Cash" as const });
    await sellMembership(admin, b.id, { planId: plan.id, startDate: addDays(today, -5), discount: 0, includeRegFee: true, payAmount: 100000, payMethod: "Cash" as const });
  });

  it("holds an unknown device and ignores what it sends until a gym adds its serial", async () => {
    const r = await call(cdataGet, `cdata?SN=${serial}&options=all`);
    expect(r.text).toContain(`GET OPTION FROM: ${serial}`);
    expect((await db.device.findUniqueOrThrow({ where: { serial } })).approved).toBe(false);
    expect((await call(cdataPost, `cdata?SN=${serial}&table=ATTLOG`, `1001\t${today} 06:00:00\t0\t1\n`)).text).toBe("OK");
    expect(await db.accessLog.count({ where: { deviceId: (await db.device.findUniqueOrThrow({ where: { serial } })).id } })).toBe(0);
    expect((await call(poll, `getrequest?SN=${serial}`)).text).toBe("OK");

    await saveDevice(admin, { serial, name: "Main door", branchId: gym.a.id, relaySeconds: 5 });
    const other = await makeGym();
    const stranger = pick(await other.user("Super Admin"), other.a.id);
    await expect(saveDevice(stranger, { serial, name: "Mine", branchId: other.a.id, relaySeconds: 5 })).rejects.toThrow(/another gym/);
  });

  it("enrols with consent, sends commands on the next poll and records the results", async () => {
    const d = await db.device.findUniqueOrThrow({ where: { serial } });
    await expect(enrol(admin, active, d.id, "FP", false)).rejects.toThrow(/consent/);
    await enrol(admin, active, d.id, "FP", true);
    await enrol(admin, lapsed, d.id, "FACE", true);
    const m = await db.member.findUniqueOrThrow({ where: { id: active } });
    expect(m.devicePin).toMatch(/^\d+$/);
    expect(m.biometricConsentAt).not.toBeNull();

    const r = await call(poll, `getrequest?SN=${serial}`);
    const lines = r.text.trim().split("\n");
    expect(lines[0]).toBe(`C:1:DATA UPDATE USERINFO PIN=${m.devicePin}\tName=Asha Active\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=0`);
    expect(lines[1]).toBe(`C:2:ENROLL_FP PIN=${m.devicePin}\tFID=6\tRETRY=3\tOVERWRITE=1`);
    expect((await call(poll, `getrequest?SN=${serial}`)).text).toBe("OK");
    await call(ack, `devicecmd?SN=${serial}`, "ID=1&Return=0&CMD=DATA\nID=2&Return=-1002&CMD=ENROLL_FP\n");
    const cmds = await db.deviceCommand.findMany({ where: { deviceId: d.id, cmdNo: { in: [1, 2] } }, orderBy: { cmdNo: "asc" } });
    expect(cmds.map((c) => c.status)).toEqual(["DONE", "FAILED"]);

    // The device uploads the captured template; it is stored encrypted.
    await call(cdataPost, `cdata?SN=${serial}&table=OPERLOG`, `FP PIN=${m.devicePin}\tFID=6\tSize=4\tValid=1\tTMP=SECRETTEMPLATE\n`);
    const t = await db.biometricTemplate.findFirstOrThrow({ where: { memberId: active } });
    expect(Buffer.from(t.data).toString("latin1")).not.toContain("SECRETTEMPLATE");
    expect(unseal(t.data)).toContain("TMP=SECRETTEMPLATE");
  });

  it("turns punches into check-in and check-out, and refuses a member whose plan ended", async () => {
    const pin = (await db.member.findUniqueOrThrow({ where: { id: active } })).devicePin!;
    const r = await call(cdataPost, `cdata?SN=${serial}&table=ATTLOG`, `${pin}\t${today} 06:00:00\t0\t1\n${pin}\t${today} 06:00:00\t0\t1\n${pin}\t${today} 07:10:00\t0\t1\n424242\t${today} 06:05:00\t0\t15\n`);
    expect(r.text).toBe("OK: 4");
    const visits = await db.attendance.findMany({ where: { memberId: active } });
    expect(visits).toHaveLength(1);
    expect(visits[0]!.method).toBe("Fingerprint");
    expect(visits[0]!.checkOut).not.toBeNull();
    expect(await db.accessLog.count({ where: { pin: "424242", result: "UNKNOWN" } })).toBeGreaterThan(0);

    // Lalit's plan is ended early: his next punch is refused and he is taken off the device.
    await db.membership.updateMany({ where: { memberId: lapsed }, data: { endDate: new Date(`${addDays(today, -1)}T00:00:00Z`) } });
    const lpin = (await db.member.findUniqueOrThrow({ where: { id: lapsed } })).devicePin!;
    await call(cdataPost, `cdata?SN=${serial}&table=ATTLOG`, `${lpin}\t${today} 06:30:00\t0\t15\n`);
    expect(await db.attendance.count({ where: { memberId: lapsed } })).toBe(0);
    expect((await db.accessLog.findFirstOrThrow({ where: { memberId: lapsed } })).result).toBe("DENIED");
    expect((await call(poll, `getrequest?SN=${serial}`)).text).toContain(`DATA DELETE USERINFO PIN=${lpin}`);
    // The daily sync agrees and has nothing more to do.
    expect((await syncDevices(gym.org.id, today)).changes).toBe(0);
  });

  it("deletes biometric data when the member is deleted", async () => {
    const pin = (await db.member.findUniqueOrThrow({ where: { id: active } })).devicePin!;
    await deleteMember(admin, active);
    expect(await db.biometricTemplate.count({ where: { memberId: active } })).toBe(0);
    expect((await call(poll, `getrequest?SN=${serial}`)).text).toContain(`DATA DELETE USERINFO PIN=${pin}`);
    const m = await db.member.findUniqueOrThrow({ where: { id: active } });
    expect(m.biometricConsentAt).toBeNull();
  });
});
