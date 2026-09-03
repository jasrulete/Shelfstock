# 0008 — The companion ships as a GitHub Release APK

**Status:** Accepted

Applies to
[`shelfstock-companion`](https://github.com/jasrulete/shelfstock-companion).

## Context

Google Play requires a one-time developer registration fee, identity
verification, a privacy policy, a store listing, and a review cycle measured in
days — for an internal admin tool whose entire user population is the shop
owner.

The app is built with EAS and attached to a GitHub Release as an APK.

## Decision

Distribute the APK through GitHub Releases. No Play Store listing.

## Consequences

- **Installation requires enabling unknown sources.** Nobody evaluating this
  project will do that, which has a consequence the roadmap treats as its
  single most important finding: **an APK-only feature with no recording is
  invisible to every person who matters.** `docs/screenshots/` in the companion
  repo currently contains one file, `.gitkeep`. Push notifications, the barcode
  scanner and the offline cache therefore have no visual evidence anywhere.

  That is why Roadmap Phase 2 — screenshots and a scan GIF — sits *ahead* of
  nine polish items. Unrecorded work is indistinguishable from work not done.
- **No update channel.** `EXPO_PUBLIC_API_URL` is baked at build time,
  `expo-updates` is absent, and `app.json` sets no `runtimeVersion`, so a
  breaking API change strands installed builds. Recorded as
  [KW-8](../SECURITY.md#kw-8--an-installed-apk-can-be-stranded-by-an-api-change).

  A version handshake was proposed and **held**: the affected population is
  approximately one person, and a buggy semver comparator bricks the app more
  reliably than the problem it solves. Reopen it if the app ever has users who
  are not the developer.
- No privacy policy is published, which is consistent with
  [ADR-0004](0004-offline-reads-not-writes.md) keeping customer PII off the
  device in the first place.

## Alternatives considered

**Play Store internal testing track.** Still requires the registration fee and
identity verification. Reasonable if the app ever needs testers who are not the
developer.

**Expo Go.** Rejected: it cannot deliver the native modules this app depends on
(`expo-secure-store`, `expo-camera`, push notifications) in a way that
represents the real build, so a demo through Expo Go would demo something other
than the shipped app.

**A web build of the companion.** Rejected: the barcode scanner is the reason
the app exists, and it needs the camera on a phone in a stockroom. A web build
would be the storefront's admin area, which already exists.
