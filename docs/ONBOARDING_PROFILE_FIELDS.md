# Onboarding Profile Fields

All fields a user can set during onboarding — **required** (must set to continue) vs **optional** (can set).  
Source: Personal flow = `(onboarding-personal)/profile-core.tsx` + subprofile components; Business flow = `(onboarding-business)/profile-business.tsx`.

**Last updated:** 2026-04-26

---

## 1. Personal account onboarding

User reaches profile setup via: **Get started** → **Personal account** → sign up → **Get started personal** → **Create personal profile** → **profile-core** (unified profile + subprofiles).

### 1.1 Core profile (About you) — `user_profiles`

| Field | Required? | Notes |
|-------|-----------|--------|
| **Profile photo** | **Yes** | At least 1 photo (main photo; used on event cards). |
| **First name** | **Yes** | |
| **Last name** | **Yes** | |
| **Birth date** | **Yes** | Date picker; must be 18+ (max date = today − 18 years). Shown as age only. |
| **Gender** | **Yes** | One of: Female, Male, Other. |
| **City** | **Yes** | Free text with autocomplete from `cities.json`; optional “Use my location”. |
| Education | No | One of: High school graduate, Bachelor’s, Master’s, Doctorate/PhD, Other. |
| Occupation | No | Free text (“What do you do?”). |
| Languages | No | Multi-select from: English, German, Ukrainian, Spanish, French, Italian, Polish, Russian, Turkish, Other. |
| Instagram | No | @username or instagram.com/username. |
| Night owl | No | Yes / No / Skip (stored as nullable boolean). |

Validation to continue: user must fill all required core fields and add at least one profile photo (`handleContinue` in `profile-core.tsx`).

---

### 1.2 Mode profiles (subprofiles)

User can **enable/disable** each mode (Romance default ON; Friends and Business OFF by default).  
Only **enabled** modes are saved. For each enabled mode, the following fields are available; **none are required to press Continue** (progress % encourages bio, photos, interests / networking goals).

#### Romance subprofile (`sub_profiles.mode = 'romance'`)

| Field | Required? | Options / type |
|-------|-----------|------------------|
| Photos | No (recommended for progress) | Up to 3 slots. |
| Video | No | 1 slot, max 10 s. |
| Bio | No | Free text. |
| Height | No | Free text. |
| Weight | No | Free text. |
| Lifestyle | No | Single: Very active, Moderately active, Walks & light movement, Mostly relaxed, Spontaneous bursts, Night owl, Early bird. |
| Smoking | No | Single: No, Yes cigarettes, Yes weed, Yes both, Socially, Prefer not to say. |
| Alcohol | No | Single: No, Yes socially, Yes regularly, Rarely, Prefer not to say. |
| Kids | No | Single: No kids, Have kids, Don’t want kids, Want kids, Open to kids, Prefer not to say. |
| Interests | No | Multi-select (popular: Travel, Music, Food, Fitness, Movies + custom). |
| Sexual views | No | Single: Straight, Gay, Lesbian, Bisexual, Pansexual, Asexual, Queer, Questioning, Prefer not to say. |
| Relationship goals | No | Multi-select: Something serious, Long-term, Marriage, Keeping it casual, Friends first, Open to whatever, Not sure yet. |
| Religion | No | Single: Agnostic, Atheist, Buddhist, Christian, Hindu, Jewish, Muslim, Spiritual, Other, Prefer not to say. |
| Political views | No | Single: Liberal, Moderate, Conservative, Apolitical, Other, Prefer not to say. |
| Values | No | Multi-select: Honesty, Family, Adventure, Growth, Loyalty, Creativity, Independence, Emotional maturity, Kindness, Ambition, Balance, Communication, Trust, Open-mindedness, Humor. |
| Pets | No | Multi (max 2): No pets, Dogs, Cats, Birds, Other pets, Love pets. |
| Allergies | No | Multi (max 3): None, Peanuts, Gluten, Dairy, Shellfish, Tree nuts, Allergic to pets, Other, Prefer not to say. |
| Food | No | Single: Omnivore, Vegetarian, Vegan, Pescatarian, Flexitarian, Keto, Halal, Kosher, Other, Prefer not to say. |

#### Friends subprofile (`sub_profiles.mode = 'friends'`)

| Field | Required? | Options / type |
|-------|-----------|------------------|
| Photos | No | Up to 3 slots. |
| Video | No | 1 slot, max 10 s. |
| Bio | No | Free text. |
| Interests | No | Multi-select (popular: Hiking, Coffee, Travel, Movies, Fitness + custom). |
| Lifestyle | No | Same list as Romance (includes Night owl / Early bird). |
| Alcohol | No | Same as Romance. |
| Smoking | No | Same as Romance. |
| Meetup goals | No | Multi: Meeting in real life, Sport buddy, Coffee chats, Hiking & outdoor, Cultural events, Gaming, Travel buddy, Study buddy, Small groups, Large gatherings. |
| Status | No | Single: Single, Married, In a relationship, Divorced, Widowed, Prefer not to say. |
| Kids | No | Single: No kids, Have kids, Expecting, Toddlers, Older kids, Prefer not to say. |
| Pets | No | Same options as Romance (max 2). |
| Allergies | No | Same options as Romance (max 3). |
| Food | No | Same as Romance. |

#### Business subprofile (`sub_profiles.mode = 'business'`)

| Field | Required? | Options / type |
|-------|-----------|------------------|
| Photos | No | Up to 3 slots (first = main). |
| Video | No | 1 slot, max 10 s. |
| Bio | No | Free text. |
| Role | No | Free text (constants suggest: Founder, Executive, Manager, Specialist, Consultant, Freelancer, Student, Investor, Other). |
| Company | No | Free text. |
| Area | No | Free text (e.g. industry/domain). |
| Networking goals | No | Multi: Partnerships, Hiring, Mentorship, Sales & clients, Investor relations, Collaboration, Freelance opportunities, Industry events, Learning & growth. |
| Skills | No | Multi (popular: Project management, Marketing, Sales, Leadership, Data analytics + custom). |
| Interests | No | Multi (popular: Tech, Networking, Marketing, Leadership, Innovation + custom). |
| Instagram | No | Business Instagram handle. |

---

## 2. Business account onboarding

User reaches business profile via: **Get started** → **Business account** → sign up → **Get started business** → **profile-business**.

Stored in `business_profiles` (separate from personal `user_profiles` / `sub_profiles`).

### 2.1 Business profile fields

| Field | Required? | Notes |
|-------|-----------|--------|
| **Business name** | **Yes** | |
| **Area** | **Yes** | e.g. industry/domain. |
| **Bio** | **Yes** | |
| Location | No | Free text. |
| Tags | No | Up to 10 custom tags. |
| Website | No | |
| Instagram | No | |
| Facebook | No | |
| LinkedIn | No | |
| Logo | No | One image; optional upload. |

Validation to continue: `businessName`, `area`, and `bio` must be non-empty (`profile-business.tsx` `handleContinue`).

---

## 3. Summary

- **Personal (core):** Required = 1 profile photo, first name, last name, birth date, gender, city. Optional = education, occupation, languages, Instagram.
- **Personal (subprofiles):** No field is required to continue; for each enabled mode (Romance / Friends / Business), all listed fields are optional. Progress % encourages bio, photos, and interests (or networking goals for Business).
- **Business account:** Required = business name, area, bio. Optional = location, tags, website, Instagram, Facebook, LinkedIn, logo.
