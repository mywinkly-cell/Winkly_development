/** Send notifications via Expo Push API (shared by Edge Functions). */

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  channelId?: string;
  data?: Record<string, unknown>;
};

export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<{ ok: boolean; detail?: string }> {
  if (messages.length === 0) return { ok: true };
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
      ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        sound: m.sound ?? "default",
        channelId: m.channelId ?? "default",
        data: m.data ?? {},
      })),
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return { ok: false, detail: t.slice(0, 500) };
  }
  const json = (await res.json()) as { data?: { status?: string }[] };
  const errs = (json.data ?? []).filter((r) => r.status === "error");
  if (errs.length > 0) {
    return { ok: false, detail: "Some receipts returned error status" };
  }
  return { ok: true };
}
