# Winkly E2E tests (Maestro)

End-to-end UI tests for the launch-critical journey:

**signup → onboarding → mode selection → first discover screen.**

A broken onboarding at launch is catastrophic, so `critical-path.yaml` is the
must-pass gate before any Go-Live build is promoted.

## Why Maestro (vs Detox)

Maestro needs no native test harness, no per-build config, and runs the same
YAML flows on iOS simulators, Android emulators, and physical devices. That
keeps E2E maintainable for a small team on a fast-moving Expo app.

## Install

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
# or: brew install maestro
maestro --version
```

## Run

Build and install a dev/preview build on a booted simulator/emulator first
(Maestro drives the installed `com.winkly.app`, not Metro):

```bash
# Android
npm run mobile:android
# iOS
npm run mobile:ios
```

Then, from the repo root or `apps/mobile/`:

```bash
# Full critical path (npm scripts wrap maestro)
npm run mobile:test:e2e
npm run mobile:test:e2e:ios      # iPhone 16 simulator
npm run mobile:test:e2e:android  # emulator-5554

# Or with a unique throwaway account (bash)
maestro test \
  -e EMAIL="qa+$(date +%s)@winkly.test" \
  -e PASSWORD="Test1234!" \
  .maestro/critical-path.yaml

# A single flow
maestro test .maestro/flows/mode-selection.yaml

# Interactive selector explorer
maestro studio
```

> Use a test Supabase project (or seeded test users) so signup/onboarding don't
> pollute production data. With email confirmation enabled, point the flow at an
> account that is already confirmed, or disable confirmation in the test project.

## Structure

| File | Purpose |
| --- | --- |
| `critical-path.yaml` | Orchestrates the four sub-flows end to end. |
| `flows/signup.yaml` | Create a Personal account via email. |
| `flows/onboarding.yaml` | Progress through the onboarding wizard. |
| `flows/mode-selection.yaml` | Assert the 2×2 gateway and enter Events. |
| `flows/discover.yaml` | Assert the first in-mode screen renders. |

## Improving stability

Flows currently match on visible text because screens don't expose `testID`s.
As you add `testID=` props to key elements (buttons, inputs, the bottom bar),
switch the selectors here to `id:` for faster, locale-independent matching.

## CI

Run on a hosted device farm (e.g. Maestro Cloud) on the release branch:

```bash
maestro cloud --apiKey "$MAESTRO_CLOUD_API_KEY" app-release.apk .maestro/
```
