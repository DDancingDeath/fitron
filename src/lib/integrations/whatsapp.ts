import "server-only";

// Sends one WhatsApp message through the configured provider. Secrets come from the server
// environment only; the app stores which mode is on, never the keys.
//   demo       nothing leaves the server; the message is logged
//   cloud      Meta WhatsApp Cloud API (official). Needs WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
//   connector  the linked-phone connector in prototype/connector. Needs WA_CONNECTOR_URL, WA_CONNECTOR_KEY

export type WaMode = "demo" | "cloud" | "connector";
export type Outgoing = {
  localId: string;
  to: string;
  body: string;
  /** Approved Cloud API template and its body parameters, in order. */
  template?: { name: string; language: string; params: string[] };
  pdf?: { bytes: Uint8Array; filename: string };
};
export type SendResult = { status: "Logged" | "Sent" | "Queued" | "Failed"; providerMessageId?: string; error?: string };

const env = (k: string) => process.env[k]?.trim() || "";
const graph = () => `https://graph.facebook.com/${env("WHATSAPP_API_VERSION") || "v21.0"}`;

export const providerReady = (mode: WaMode): string | null => {
  if (mode === "cloud" && !(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID"))) return "WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are not set on the server.";
  if (mode === "connector" && !(env("WA_CONNECTOR_URL") && env("WA_CONNECTOR_KEY"))) return "WA_CONNECTOR_URL and WA_CONNECTOR_KEY are not set on the server.";
  return null;
};

async function cloudCall(path: string, init: RequestInit) {
  const res = await fetch(`${graph()}/${env("WHATSAPP_PHONE_NUMBER_ID")}${path}`, { ...init, headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; id?: string; messages?: { id: string }[] };
  if (!res.ok) throw new Error(json.error?.message ?? `WhatsApp API returned ${res.status}`);
  return json;
}

async function sendCloud(m: Outgoing): Promise<SendResult> {
  let mediaId: string | undefined;
  if (m.pdf) {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append("file", new Blob([m.pdf.bytes as BlobPart], { type: "application/pdf" }), m.pdf.filename);
    mediaId = (await cloudCall("/media", { method: "POST", body: form })).id;
  }
  const document = mediaId ? { id: mediaId, filename: m.pdf!.filename } : undefined;
  const payload = m.template
    ? {
        type: "template",
        template: {
          name: m.template.name,
          language: { code: m.template.language },
          components: [...(document ? [{ type: "header", parameters: [{ type: "document", document }] }] : []), ...(m.template.params.length ? [{ type: "body", parameters: m.template.params.map((text) => ({ type: "text", text: text || "-" })) }] : [])],
        },
      }
    : document
      ? { type: "document", document: { ...document, caption: m.body } }
      : { type: "text", text: { body: m.body, preview_url: true } };
  const json = await cloudCall("/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: m.to, ...payload }) });
  return { status: "Sent", providerMessageId: json.messages?.[0]?.id };
}

async function connectorCall(path: string, body: unknown) {
  const res = await fetch(`${env("WA_CONNECTOR_URL").replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-fitron-key": env("WA_CONNECTOR_KEY") },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `Connector returned ${res.status}`));
  return json;
}

async function sendConnector(m: Outgoing): Promise<SendResult> {
  const media = m.pdf ? { mimetype: "application/pdf", data: Buffer.from(m.pdf.bytes).toString("base64"), filename: m.pdf.filename } : undefined;
  await connectorCall("/send", { id: m.localId, to: m.to, text: m.body, media });
  // The connector sends from a queue with 8–15 s gaps; the final status is fetched later.
  return { status: "Queued", providerMessageId: m.localId };
}

export async function sendWhatsApp(mode: WaMode, m: Outgoing): Promise<SendResult> {
  if (mode === "demo") return { status: "Logged" };
  const missing = providerReady(mode);
  if (missing) return { status: "Failed", error: missing };
  try {
    return mode === "cloud" ? await sendCloud(m) : await sendConnector(m);
  } catch (e) {
    return { status: "Failed", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Final statuses for messages the connector queued: { id: { status, error } }. */
export async function connectorResults(ids: string[]): Promise<Record<string, { status: string; error?: string }>> {
  if (!ids.length || providerReady("connector")) return {};
  try {
    return (await connectorCall("/results", { ids })) as Record<string, { status: string; error?: string }>;
  } catch {
    return {};
  }
}

export type ConnectorStatus = { state: string; number?: string; qr?: string; sentToday?: number; cap?: number };

/** The connector's link state and, while it waits for a scan, the current QR code (data URL). */
export async function connectorStatus(): Promise<ConnectorStatus> {
  const base = env("WA_CONNECTOR_URL").replace(/\/$/, "");
  const h = { "x-fitron-key": env("WA_CONNECTOR_KEY") };
  const st = (await (await fetch(`${base}/status`, { headers: h, signal: AbortSignal.timeout(10_000) })).json()) as ConnectorStatus;
  if (st.state === "ready") return st;
  const qr = (await (await fetch(`${base}/qr`, { headers: h, signal: AbortSignal.timeout(10_000) })).json()) as { qr?: string; state?: string };
  return { ...st, state: qr.state ?? st.state ?? "starting", qr: qr.qr };
}

/** "Unlink": the connector signs out of WhatsApp. Errors are ignored; the app forgets the link either way. */
export async function connectorLogout() {
  if (providerReady("connector")) return;
  try {
    await fetch(`${env("WA_CONNECTOR_URL").replace(/\/$/, "")}/logout`, { method: "POST", headers: { "Content-Type": "application/json", "x-fitron-key": env("WA_CONNECTOR_KEY") }, body: "{}", signal: AbortSignal.timeout(10_000) });
  } catch {
    // The connector may already be off.
  }
}

/** Connection check for Settings: who we'd send as, or why we can't. */
export async function providerStatus(mode: WaMode): Promise<{ ok: boolean; text: string; qr?: string; number?: string; name?: string }> {
  if (mode === "demo") return { ok: true, text: "Demo mode: messages are logged in Fitron and not sent." };
  const missing = providerReady(mode);
  if (missing) return { ok: false, text: missing };
  try {
    if (mode === "cloud") {
      const res = await fetch(`${graph()}/${env("WHATSAPP_PHONE_NUMBER_ID")}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}` }, signal: AbortSignal.timeout(10_000) });
      const j = (await res.json()) as { display_phone_number?: string; verified_name?: string; quality_rating?: string; error?: { message?: string } };
      if (!res.ok) return { ok: false, text: j.error?.message ?? `WhatsApp API returned ${res.status}` };
      return { ok: true, text: `Connected as ${j.verified_name ?? "?"} (${j.display_phone_number ?? "?"}), quality ${j.quality_rating ?? "unknown"}.`, number: j.display_phone_number, name: j.verified_name };
    }
    const st = await connectorStatus();
    if (st.state === "ready") return { ok: true, text: `Linked to ${st.number ?? "the gym phone"}. ${st.sentToday ?? 0} of ${st.cap ?? 250} sent today.` };
    return { ok: false, text: `Not linked yet (${st.state}). Scan the QR from WhatsApp › Linked devices on the gym phone.`, qr: st.qr };
  } catch (e) {
    return { ok: false, text: `Couldn't reach the provider: ${e instanceof Error ? e.message : String(e)}` };
  }
}
