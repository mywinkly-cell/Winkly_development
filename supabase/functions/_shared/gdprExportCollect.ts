/** GDPR export helpers — partition messages and validate user scoping. */

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string | null;
  created_at?: string;
  message_type?: string | null;
  attachments?: unknown;
  reply_to_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  delete_type?: string | null;
  metadata?: unknown;
  status?: string | null;
  client_id?: string | null;
};

export type MessageMetadataRow = {
  id: string;
  conversation_id: string;
  created_at?: string;
  message_type?: string | null;
};

export function partitionMessages(messages: MessageRow[], userId: string): {
  messages_sent: MessageRow[];
  messages_metadata: MessageMetadataRow[];
} {
  const messages_sent: MessageRow[] = [];
  const messages_metadata: MessageMetadataRow[] = [];

  for (const row of messages) {
    if (row.sender_id === userId) {
      messages_sent.push(row);
    } else {
      messages_metadata.push({
        id: row.id,
        conversation_id: row.conversation_id,
        created_at: row.created_at,
        message_type: row.message_type ?? null,
      });
    }
  }

  return { messages_sent, messages_metadata };
}

/** Returns true when every row in `rows` has one of `ownerFields` equal to userId. */
export function rowsOwnedByUser(
  rows: Record<string, unknown>[] | null | undefined,
  userId: string,
  ownerFields: string[],
): boolean {
  if (!rows?.length) return true;
  return rows.every((row) =>
    ownerFields.some((field) => row[field] === userId)
  );
}

/** Ensures profile tables only contain the requesting user's rows (no cross-user leak). */
export function exportContainsOnlyUserProfiles(
  exportPayload: {
    profiles?: {
      core?: Record<string, unknown>[] | null;
      mode?: Record<string, unknown>[] | null;
      business?: Record<string, unknown>[] | null;
      sub_profiles?: Record<string, unknown>[] | null;
    };
  },
  userId: string,
): boolean {
  const p = exportPayload.profiles;
  if (!p) return true;

  const coreOk = !p.core?.length || p.core.every((r) => r.id === userId);
  const modeOk = rowsOwnedByUser(p.mode, userId, ["user_id"]);
  const businessOk = !p.business?.length || p.business.every((r) => r.id === userId);
  const subOk = rowsOwnedByUser(p.sub_profiles, userId, ["user_id"]);

  return coreOk && modeOk && businessOk && subOk;
}

export const EXPORT_RATE_LIMIT_HOURS = 24;
export const SIGNED_URL_EXPIRES_SECONDS = 900;

export function hoursUntilNextExport(lastExportAt: string | null | undefined): number | null {
  if (!lastExportAt) return null;
  const last = new Date(lastExportAt).getTime();
  if (Number.isNaN(last)) return null;
  const nextAllowed = last + EXPORT_RATE_LIMIT_HOURS * 60 * 60 * 1000;
  const remainingMs = nextAllowed - Date.now();
  if (remainingMs <= 0) return null;
  return Math.ceil(remainingMs / (60 * 60 * 1000));
}

export function isExportRateLimited(lastExportAt: string | null | undefined): boolean {
  return hoursUntilNextExport(lastExportAt) !== null;
}
