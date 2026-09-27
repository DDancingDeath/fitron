// Gym dates are Indian calendar dates. Stored as @db.Date (midnight UTC).

const IST_OFFSET_MS = 330 * 60_000;

/** Today's date in India, as YYYY-MM-DD. */
export const todayIso = (now = new Date()) => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

export const toIso = (d: Date) => d.toISOString().slice(0, 10);

export const fromIso = (s: string) => new Date(`${s}T00:00:00.000Z`);
