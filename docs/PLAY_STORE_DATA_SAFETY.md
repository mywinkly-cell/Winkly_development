# Winkly — Google Play Data Safety declaration

**Purpose:** Play Console **Data safety** form answers aligned with `docs/PRIVACY_POLICY.md`. Use this when completing **App content → Data safety** before submission.

**Last updated:** 2026-06-07

---

## Summary (quick reference)

| Question | Answer |
|----------|--------|
| **Does your app collect or share user data?** | Yes — collects data |
| **Is all collected data encrypted in transit?** | Yes (HTTPS/TLS) |
| **Do you provide a way for users to request deletion?** | Yes — in-app account deletion + support@winkly.app |
| **Does the app contain ads?** | **No** |
| **Is data sold to third parties?** | **No** |

---

## 1. Data types to declare

Declare each type below as **Collected** (not sold). Unless noted, data is **not shared** with third parties except **service providers** processing on Winkly’s behalf (Supabase, PostHog, payment/AI providers as applicable).

### 1.1 Location

| Play Console field | Declaration |
|--------------------|-------------|
| **Approximate location** | **Collected** |
| **Precise location** | **Not collected/stored** (device GPS may be read transiently for city/discovery; stored value is approximated per Privacy Policy §2.5) |

**Purpose:** App functionality (discovery, events, planner, AI suggestions).  
**Optional?** Yes — user grants/revokes location permission; can set approximate vs precise in Privacy & Safety.  
**Ephemeral?** No — approximated location/city may be stored for features.

### 1.2 Personal info

| Field | Collected? | Notes |
|-------|------------|-------|
| **Name** | Yes | Profile |
| **Email address** | Yes | Account |
| **User IDs** | Yes | UUID |
| **Address** | No | City only, not postal/home address stored as profile default |
| **Phone number** | Optional | Only if user adds or OAuth provides; not required |
| **Other info** | Yes | Gender, DOB, bio, education, occupation, languages, interests, business profile fields |

**Purpose:** Account management, app functionality, personalization.

### 1.3 Photos and videos

| Field | Declaration |
|-------|-------------|
| **Photos** | **Collected** — profile photos, chat attachments, event images (user-provided) |

**Purpose:** App functionality, account management.

### 1.4 Messages

| Field | Declaration |
|-------|-------------|
| **Other in-app messages** | **Collected** — chat text and attachments |

**Purpose:** App functionality.

**Encryption:** Encrypted in transit (TLS). Not end-to-end encrypted.

### 1.5 App activity

| Field | Declaration |
|-------|-------------|
| **App interactions** | **Collected** via PostHog — screen paths, feature event names (e.g. discover_open) |
| **Other user-generated content** | **Collected** — planner items, events, profile content (also covered above) |

**Purpose:** Analytics (product improvement). PostHog is gated on cookie/analytics consent at first use (`terms-cookies` screen).

**Linked to user?** Yes — analytics uses user ID, not name/email/message content (see Privacy Policy §2.4).

### 1.6 Device or other IDs

| Field | Declaration |
|-------|-------------|
| **Device or other IDs** | **Collected** — session/auth identifiers; PostHog may use device/app instance identifiers |

**Purpose:** App functionality, analytics, fraud prevention.

---

## 2. Data NOT collected (do not declare)

- **Financial info** — payments handled by app store; Winkly does not store card numbers in-app.
- **Health info** — not collected.
- **Political or religious beliefs** — not collected as dedicated categories.
- **Contacts list (raw)** — not stored; contact matching uses hashed identifiers on device only (when feature enabled).
- **Web browsing history** — not collected.
- **Advertising data** — no ads.

---

## 3. Data sharing

| Sharing type | Answer |
|--------------|--------|
| **Sold to third parties** | **No** |
| **Shared for advertising** | **No** |
| **Shared with service providers** | **Yes** — hosting/auth (Supabase), analytics (PostHog), AI providers (allowlisted context only), payment processors |

In Play Console, for each collected data type, indicate sharing only where processors receive that category (e.g. photos → Supabase Storage; messages → Supabase; analytics events → PostHog).

---

## 4. Security practices

- Data encrypted **in transit** (HTTPS/TLS).
- Users can **request account deletion** in-app (General settings → Account & Identity → Delete account) and via support@winkly.app.
- Privacy policy URL: **https://winkly.app/privacy**

---

## 5. Play Console walkthrough checklist

1. **Privacy policy URL:** `https://winkly.app/privacy`
2. **Ads:** No, app does not contain ads.
3. **Data collection:** Yes.
4. For each data type in §1, mark **Collected**, purposes (**App functionality**, **Analytics** where applicable), **Optional/Required** as noted.
5. **Approximate location:** Collected, optional, app functionality.
6. **Photos:** Collected, optional (user uploads), app functionality.
7. **Messages:** Collected, app functionality.
8. **App interactions (analytics):** Collected, analytics, optional (consent-gated).
9. Confirm answers match live Privacy Policy after deploy.
10. Run `npm run website:verify` from repo root after deploying `website/` to winkly.app.

---

## 6. Consistency checks (avoid rejection)

| Privacy Policy says | Data safety must say |
|---------------------|----------------------|
| PostHog analytics, no PII in events | App interactions collected; not name/email/content |
| Approximate location stored, not precise GPS | Approximate location yes; precise no (or ephemeral only) |
| Profile photos and chat media | Photos + messages collected |
| No selling data | “Data sold” = No for all types |
| No ads | Ads declaration = No |

---

*Internal reference only. Public commitments are in `docs/PRIVACY_POLICY.md` and hosted pages at winkly.app.*
