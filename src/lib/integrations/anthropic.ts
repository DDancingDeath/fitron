import "server-only";

// Claude Messages API over fetch. The key stays on the server (ANTHROPIC_API_KEY).

export const aiReady = () => !!process.env.ANTHROPIC_API_KEY?.trim();
export const aiModel = () => process.env.AI_MODEL?.trim() || "claude-sonnet-5";

export type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };

export async function claude(req: { system: string; messages: Msg[]; tools: readonly object[]; maxTokens?: number }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!.trim(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: aiModel(), max_tokens: req.maxTokens ?? 2048, system: req.system, messages: req.messages, tools: req.tools }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as { content: Block[]; stop_reason: string };
}
