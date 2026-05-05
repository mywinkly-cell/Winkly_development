import * as Crypto from "expo-crypto";
import type * as Contacts from "expo-contacts";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "");
  return digits;
}

export async function sha256Hex(input: string) {
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

export async function hashContactIdentifiers(contact: Contacts.Contact) {
  const emailValues = (contact.emails ?? [])
    .map((e) => e.email)
    .filter(Boolean)
    .map((e) => normalizeEmail(String(e)));

  const phoneValues = (contact.phoneNumbers ?? [])
    .map((p) => p.number)
    .filter(Boolean)
    .map((p) => normalizePhone(String(p)))
    .filter((p) => p.length >= 7);

  const emailHashes = await Promise.all(emailValues.map((e) => sha256Hex(e)));
  const phoneHashes = await Promise.all(phoneValues.map((p) => sha256Hex(p)));

  return {
    emailHashes: Array.from(new Set(emailHashes)),
    phoneHashes: Array.from(new Set(phoneHashes)),
  };
}

