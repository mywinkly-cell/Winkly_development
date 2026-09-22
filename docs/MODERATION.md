# Image moderation — profile photos & chat images

**Goal:** no explicit, violent or illegal imagery can appear as a profile photo or in chat media, and every user has a clear way to report what slips through.

> ## 🚫 PUBLIC LAUNCH BLOCKER — known-CSAM hash matching
>
> Classifier-based moderation (below) is **not** a substitute for matching uploads against hashes of **known child sexual abuse material**. Before Winkly opens to the public (beyond the closed beta), every profile photo and chat image **must** also be checked against an industry hash list, e.g. via an established hash-matching service (such as Microsoft PhotoDNA, Thorn Safer, or the IWF / NCMEC hash lists through an approved vendor). This needs an application/approval process with the provider, so start it early.
>
> Requirements when it lands:
> - Runs server-side in `moderate-media` **before** the vendor check (add it as another `ModerationProvider` step, or a pre-step), on every image kind.
> - A hash match is **block + preserve + report**, not just block: the object is kept in a restricted evidence store (not deleted), the account is suspended, and the match is reported to the competent authority as required by law (in Germany: BKA / via the provider's reporting channel; the EU interim CSAM regulation applies). Legal must sign off on the retention and reporting procedure.
> - Moderators must never be shown hash-matched content in Studio.
>
> Tracked as a launch blocker: **do not remove this box until it is implemented and documented here.**

---

## 1. Flow

```
App                                  Storage                      Edge Function: moderate-media          DB
───                                  ───────                      ─────────────────────────────          ──
PROFILE PHOTO
upload ─────────────────────────────▶ media-quarantine (private)
invoke moderate-media {profile_photo, path} ─────────────────────▶ download → vendor → verdict
                                                                   pass   → copy to user-photos (public),   ──▶ media_moderation row
                                                                            delete quarantine copy, return url
                                                                   review → keep in quarantine              ──▶ row (status=review) ──▶ report-notify inbox
                                                                   block  → delete                           ──▶ row (status=block)
app puts ONLY passed urls on the profile ────────────────────────────────────────────────────────────────────▶ trigger rejects any new
                                                                                                                 url without a pass row

CHAT IMAGE
upload ─────────────────────────────▶ chat-media (private, members only)
invoke moderate-media {chat_image, path} ────────────────────────▶ download → vendor → verdict
                                                                   pass / review → keep                      ──▶ row
                                                                   block → delete, app doesn't send          ──▶ row
send message (attachment = storage path)
recipient loads chat → signed URL + get_chat_media_moderation(paths) ─────────────────────────────────────────▶ verdict per path
```

### Outcomes

| Verdict | Profile photo | Chat image |
|---|---|---|
| **pass** | Published to the public `user-photos` bucket; can go anywhere on the profile, including primary. | Shown normally. |
| **review** | Stays in the private `media-quarantine` bucket. Only the uploader sees it ("Photos in review" strip in the profile editor). Not on the profile, so it can't be primary. Queued for manual review; on approval the server appends it to the **end** of the profile's photo list. | Sent. The **recipient** sees a blurred placeholder with **Tap to view** (and a **Report** link). The sender sees it normally with an "In review" badge. |
| **block** | Deleted. Kind message: *"This photo doesn't meet our Community Guidelines, so it wasn't added."* | Deleted, not sent. Kind message: *"…so we didn't send it."* |

### Fail closed

Anything other than a positive answer from the vendor becomes **review**, never pass:

- vendor down, timeout (10 s), HTTP error, bad credentials, rate-limited
- unexpected / partial response (e.g. nudity scores missing)
- `MODERATION_PROVIDER` unset or its secrets missing (`provider = "none"`)
- the app can't reach `moderate-media` at all → the client treats it as review and the photo is not put on the profile; a chat image without a verdict row reads as **review** for the recipient (blurred)

These rows have `failed_closed = true` so the queue can tell "vendor was down" apart from "vendor was unsure".

### Server-side enforcement (not just UI)

- Clients **cannot write** to `user-photos` any more (INSERT/UPDATE policies dropped). Only `moderate-media` (service role) publishes there.
- `enforce_moderated_profile_photos` trigger on `profiles_core`, `user_profiles`, `sub_profiles`, `profiles_mode`: any **newly added** photo URL (any position → covers the primary photo and `main_photo_url`) must have a `pass` row in `media_moderation`, or already be on one of the user's profiles (grandfathered pre-moderation photos / moving a photo between modes). Arbitrary external URLs are rejected.
- Chat verdicts come from the `get_chat_media_moderation` RPC (members of the conversation only). A `moderation` value stored on the message by the sender is ignored.
- Chat images uploaded **before** the migration (`private.media_moderation_config.chat_cutover_at`) have no verdict and read as `pass` (legacy); anything after the cutover without a verdict reads as `review`.
- Abuse guard: max 120 moderation calls per user per hour (fails closed with 429).

### Code map

| Piece | File |
|---|---|
| Decision logic (thresholds, vendor response parsing, pure) | `supabase/functions/_shared/moderation/decision.ts` |
| Vendor adapters behind `ModerationProvider` | `supabase/functions/_shared/moderation/providers.ts` |
| Edge Function | `supabase/functions/moderate-media/index.ts` |
| Table, bucket, triggers, RPC | `supabase/migrations/20260922120000_media_moderation.sql` |
| Queue notifications | `supabase/functions/report-notify/index.ts` (`type: "media_review"`) |
| App upload paths | `apps/mobile/lib/uploadMedia.ts`, `apps/mobile/lib/moderation/mediaModeration.ts` |
| Chat blur / Tap to view | `apps/mobile/components/chats/ModeratedChatImage.tsx`, `apps/mobile/lib/chats/chatMedia.ts` |
| In-review strip | `apps/mobile/components/profile/PhotosInReview.tsx` |
| Tests | `apps/mobile/__tests__/mediaModeration.test.ts` |

Not covered yet: profile **videos** and voice prompts (`user-videos`), business logos / offer images (`business-logos`), GIFs (external Giphy URLs). Chat voice notes are not images. Treat these as follow-ups.

---

## 2. Vendor choice

Both options are implemented behind the same interface; switch with the `MODERATION_PROVIDER` secret. **Neither is signed yet.** Legal must review the DPA before production keys are created.

| | **A. Sightengine** (recommended) | **B. Google Cloud Vision SafeSearch** |
|---|---|---|
| Type | Dedicated trust-and-safety vendor | General computer-vision API |
| Company / processing | Sightengine SAS, France (EU). Processing in the EU. | Google Cloud; use the **EU regional endpoint** `eu-vision.googleapis.com` so images are processed in the EU. |
| DPA | Sightengine DPA (GDPR Art. 28). Check retention settings: images should not be stored after analysis. | Google Cloud Data Processing Addendum + SCCs (Google LLC is US-based even with the EU endpoint). Vision says it does not keep images sent inline in requests. Confirm both. |
| Categories | Nudity (graded: explicit vs. suggestive vs. swimwear), gore, violence, weapons (incl. threatening), recreational drugs, self-harm, and more (hate symbols, minors, etc.) | adult, racy, violence, medical, spoof. No drugs / weapons / self-harm. |
| Fit for a dating app | Good: can tell swimwear apart from explicit content, so fewer false positives on normal beach photos. | Coarser: `racy` fires on normal swimwear, so we only use it for review at VERY_LIKELY. |
| Pricing | Per operation; each model counts. We call 6 models per image. | Per image, has a free tier. |
| Secrets | `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET` | `GOOGLE_VISION_API_KEY` (restrict the key to the Vision API), optional `GOOGLE_VISION_ENDPOINT` |

**Recommendation: A (Sightengine).** It's EU-based, covers the "illegal" categories (drugs, weapons) that SafeSearch doesn't, and grades nudity finely enough to avoid blocking normal dating photos. B is a reasonable fallback if procurement stalls, since Google Cloud is already a processor (Gemini, Places).

Thresholds are in `SIGHTENGINE_POLICY` / `SAFESEARCH_POLICY` in `decision.ts`. Change them there (and update the tests). Every verdict stores the `signals` and the rule hits (`reasons`) so thresholds can be tuned from real queue data.

### Adding / swapping a vendor

1. Implement `ModerationProvider` in `providers.ts` (`analyze()` returns normalised 0..1 signals and **throws** on any doubt).
2. Add a parser + policy in `decision.ts` with tests.
3. Register it in `getModerationProvider()` and set `MODERATION_PROVIDER`.
4. Add it to the sub-processor table in `docs/PRIVACY_POLICY.md`.

---

## 3. Setup (per environment)

```bash
npx supabase functions deploy moderate-media
npx supabase functions deploy report-notify
npx supabase secrets set MODERATION_PROVIDER=sightengine SIGHTENGINE_API_USER=... SIGHTENGINE_API_SECRET=...
# WEBHOOK_SECRET is already set (shared with notify-fanout / report-notify)
npm run supabase:push:development   # or :production — applies 20260922120000_media_moderation.sql (manual, never automatic)
```

Deploy the function **before** you ship the app build. The new app uploads to `media-quarantine`, and old app builds will fail to upload profile photos once the migration removes client writes to `user-photos`. Schedule the migration together with the app release.

Dev / staging only (never production): `MODERATION_PROVIDER=mock MODERATION_ALLOW_MOCK=true MODERATION_MOCK_VERDICT=pass|review|block|down`.

---

## 4. Reviewing the queue in Supabase Studio

New review items also land in the moderation inbox (report-notify → email / webhook, subject *"Image awaiting moderation review"*).

1. **Table Editor → `media_moderation`**, filter `status = review`, sort by `created_at` ascending (oldest first). Or in the SQL editor:
   ```sql
   select id, kind, user_id, target, reasons, failed_closed, created_at
   from public.media_moderation
   where status = 'review'
   order by created_at;
   ```
2. **Look at the image.** Storage → bucket from the row's `bucket` column (`media-quarantine` for profile photos, `chat-media` for chat) → `storage_path` → *Get URL* (signed, short expiry). Don't download to personal devices.
3. **Decide** by editing the row:
   - approve → `status = 'pass'`
   - reject → `status = 'block'`
   - fill `reviewed_by` (your name/initials) and `review_note` (short reason). `reviewed_at` is set automatically.
4. Saving triggers `moderate-media { action: "resolve" }`:
   - profile photo **pass**: published to `user-photos` and appended to the end of the user's photo list for that mode
   - **block**: object deleted (chat recipients then see "This photo was removed")
5. **Takedown of an already-public photo** (e.g. after a user report): find the row by `public_url` and set `status = 'block'`. The server deletes the object and removes the URL from every profile array.

Rows where `failed_closed = true` were held because the vendor was unavailable, not because it was unsure. After an outage, work through these first. They're usually fine.

Escalate to the account level (suspend / ban via the existing reports workflow) for repeated blocks by the same `user_id`.

---

## 5. Reporting path for users

- **Chat:** the flag icon under any received message → *Report* (writes `message_reports`); blurred images also have a **Report** link. → `report-notify` → moderation inbox.
- **Profiles:** *Report* on any profile (writes `user_reports`) → `report-notify` → moderation inbox.
- Moderators act on reported images by setting the matching `media_moderation` row to `block` (section 4.5).
- Reports are handled under the DSA notice-and-action process (see `docs/COMMUNITY_GUIDELINES.md`, `docs/PRIVACY_AND_DSA_DRAFTS.md`).

---

## 6. Verifying ("done when")

Use the vendor's own documentation sample images and the mock provider. **Never use real explicit content.**

| Check | How | Expected |
|---|---|---|
| Unsafe image is blocked | Staging with `MODERATION_PROVIDER=mock`, `MODERATION_MOCK_VERDICT=block`; or Sightengine with one of the violence/gore/weapon sample images from its model docs | Upload shows "We can't use this photo"; row `status=block`; no object left in `media-quarantine` / `chat-media` |
| Normal photo passes | Real vendor, an ordinary portrait | Photo appears on profile; row `status=pass`, `public_url` set; object in `user-photos` |
| API down → held | `MODERATION_MOCK_VERDICT=down`, or set a wrong `SIGHTENGINE_API_SECRET` | "Photo in review" notice; row `status=review`, `failed_closed=true`; photo visible only in the uploader's "Photos in review" strip; chat recipient sees blur + Tap to view |
| Bypass is closed | As a user, try `update profiles_core set core_photos = core_photos || '{https://example.com/x.jpg}'` via the API | Rejected with `photo_not_moderated` |

The decision logic and fail-closed behaviour are unit-tested in `apps/mobile/__tests__/mediaModeration.test.ts` using fixtures shaped like each vendor's documented responses.
