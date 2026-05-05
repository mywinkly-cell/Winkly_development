// apps/mobile/lib/integrations/contacts.ts
// Contacts integration facade.
//
// Note: `expo-contacts` is not currently a dependency in this repo, so this module
// stays functional via "unavailable" fallbacks. If you later add expo-contacts,
// these methods will auto-enable via dynamic import.

export type ContactsPermissionStatus = "undetermined" | "denied" | "granted" | "unavailable";

export type ContactSummary = {
  id: string;
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
};

async function tryImportExpoContacts() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await import("expo-contacts");
  } catch {
    return null;
  }
}

export async function isContactsAvailable() {
  return (await tryImportExpoContacts()) != null;
}

export async function getContactsPermissionStatus(): Promise<ContactsPermissionStatus> {
  const mod = await tryImportExpoContacts();
  if (!mod) return "unavailable";
  const res = await mod.getPermissionsAsync();
  if (res.status === "granted") return "granted";
  if (res.status === "denied") return "denied";
  return "undetermined";
}

export async function requestContactsPermissions(): Promise<ContactsPermissionStatus> {
  const mod = await tryImportExpoContacts();
  if (!mod) return "unavailable";
  const res = await mod.requestPermissionsAsync();
  if (res.status === "granted") return "granted";
  if (res.status === "denied") return "denied";
  return "undetermined";
}

export async function getContacts(limit = 200): Promise<ContactSummary[]> {
  const mod = await tryImportExpoContacts();
  if (!mod) return [];

  const res = await mod.getContactsAsync({
    pageSize: Math.max(1, Math.min(500, limit)),
    fields: [mod.Fields.Name, mod.Fields.PhoneNumbers, mod.Fields.Emails],
  });

  return (res.data ?? []).map((c: any) => ({
    id: String(c.id),
    name: String(c.name ?? c.firstName ?? c.lastName ?? "Unknown"),
    phoneNumbers: Array.isArray(c.phoneNumbers) ? c.phoneNumbers.map((p: any) => String(p.number)).filter(Boolean) : undefined,
    emails: Array.isArray(c.emails) ? c.emails.map((e: any) => String(e.email)).filter(Boolean) : undefined,
  }));
}

