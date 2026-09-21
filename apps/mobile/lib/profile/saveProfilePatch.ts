// Writes an autosave patch (see profileAutosave.ts) to Supabase. Runs as the
// signed-in user, so RLS on every table stays the source of truth — nothing here
// widens access. Photos/videos are never part of a patch.

import { supabase } from "@/lib/supabase";
import { upsertOwnProfileCore, type ProfileCoreUpdate } from "@/lib/access/profiles";
import type { SaveResult } from "./autosaveController";
import { AUTOSAVE_MODES, type ColumnMap, type ProfilePatch } from "./profileAutosave";

/** user_profiles columns that the explicit Save also mirrors into profiles_core. */
const CORE_MIRROR_COLUMNS = ["first_name", "last_name", "city", "interests", "show_full_name"] as const;

function pick(columns: ColumnMap, keys: readonly string[]): ColumnMap {
  const out: ColumnMap = {};
  for (const k of keys) if (k in columns) out[k] = columns[k];
  return out;
}

function omit(columns: ColumnMap, keys: readonly string[]): ColumnMap {
  const out: ColumnMap = {};
  for (const [k, v] of Object.entries(columns)) if (!keys.includes(k)) out[k] = v;
  return out;
}

const warn = (context: string, err: unknown) =>
  // Message only — never the patch, it holds profile content.
  console.warn(`[profile-autosave] ${context} failed:`, (err as { message?: string })?.message ?? err);

export async function saveProfilePatch(patch: ProfilePatch): Promise<SaveResult> {
  const persisted: ProfilePatch = { profile: {}, modes: {} };

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  if (!userId) {
    warn("session", "not signed in");
    return { persisted, failed: true };
  }

  let failed = false;

  // ─── user_profiles (+ profiles_core mirror) ───
  if (Object.keys(patch.profile).length) {
    try {
      // first_name/last_name are NOT NULL, and Postgres checks NOT NULL on the proposed
      // INSERT row before it notices the conflict — so a partial upsert on an existing
      // row would fail. Existing row → UPDATE; both names present → (possibly new) row → UPSERT.
      const createsRow = "first_name" in patch.profile && "last_name" in patch.profile;
      if (createsRow) {
        const { error } = await supabase
          .from("user_profiles")
          .upsert({ id: userId, ...patch.profile }, { onConflict: "id" });
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("user_profiles")
          .update(patch.profile)
          .eq("id", userId)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("user_profiles row not found");
      }

      const corePatch = pick(patch.profile, CORE_MIRROR_COLUMNS);
      if (Object.keys(corePatch).length) {
        const { error } = await upsertOwnProfileCore(userId, corePatch as ProfileCoreUpdate);
        if (error) {
          // user_profiles is already written; keep the mirrored columns dirty so the retry redoes both.
          persisted.profile = omit(patch.profile, CORE_MIRROR_COLUMNS);
          throw error;
        }
      }
      persisted.profile = patch.profile;
    } catch (err) {
      warn("user_profiles", err);
      failed = true;
    }
  }

  // ─── sub_profiles + profiles_mode, one mode at a time ───
  for (const mode of AUTOSAVE_MODES) {
    const columns = patch.modes[mode];
    if (!columns) continue;
    try {
      const payload: Record<string, unknown> = { ...columns };

      // `meta` is a single JSONB column that also holds `videos`, which autosave does not own.
      // Merge onto the current server value so a text edit can never wipe an uploaded video.
      if (columns.meta && typeof columns.meta === "object" && !Array.isArray(columns.meta)) {
        const { data: row, error: readErr } = await supabase
          .from("sub_profiles")
          .select("meta")
          .eq("user_id", userId)
          .eq("mode", mode)
          .maybeSingle();
        if (readErr) throw readErr;
        payload.meta = { ...((row?.meta as Record<string, unknown> | null) ?? {}), ...columns.meta };
      }

      const { error: subErr } = await supabase
        .from("sub_profiles")
        .upsert({ user_id: userId, mode, ...payload }, { onConflict: "user_id,mode" });
      if (subErr) throw subErr;

      // profiles_mode is what the discover feeds read. Only keep an already-published row in
      // sync; never create one here, or a half-finished onboarding would surface in feeds.
      // (The explicit Save / Finish still creates it.) Zero matched rows is fine.
      const { error: modeErr } = await supabase
        .from("profiles_mode")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("mode", mode);
      if (modeErr) throw modeErr;

      persisted.modes[mode] = columns;
    } catch (err) {
      warn(`${mode} sub-profile`, err);
      failed = true;
    }
  }

  return { persisted, failed };
}
