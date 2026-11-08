# Mobile hardening — 2026-11-08

Fixed confirmed stress-test failures while preserving normal desktop appearance:

- Unbroken multilingual student names and group labels wrap within mobile records. Stored text, including ZWNJ and emoji, remains unchanged.
- Long report values wrap inside the report's own scroll region.
- Meeting request errors now appear inside the scrolling content, with an alert role and scroll-into-view. Long errors cannot collapse the roster area or displace the persistent actions. Failed saves preserve corrections and allow retry.
- Profile score/history tables have labeled, focusable horizontal scroll regions on phones.
- Mobile checkbox controls retain a normal shape inside a large clickable label.
- Student, meeting, season, activity, group and supervisor input lengths match existing server constraints. Student phone entry uses the telephone keyboard. Server validation remains authoritative.
- Meeting editors have a viewport-height fallback for browsers lacking dynamic viewport units.

## Evidence

- **36/36 automated tests passed**, including a regression for attendance failure, alert placement, preserved corrections and retry.
- [harden.cjs](harden.cjs) passed at 320px and 390px: long Arabic/CJK/Latin/emoji content, contained profile tables, oversized RPC errors, successful retry and empty main screens. It includes an intentionally over-limit legacy name to check display resilience.
- A 32px body/control text override at 320px/390px caused no document-wide horizontal overflow. This is a text stress test, not physical-device system font or browser zoom verification.
- Existing [browser regression checks](verify.cjs) passed at 320×844, 390×844, 430×844 and 844×390: navigation, filters, synthesized touch scrolling, and saving a 300-student roster.
- All seven 1440px desktop reference PNGs remain byte-for-byte identical.
- Impeccable detector: zero findings. Installation copies match source; `git diff --check` passes.

Screenshots: [hardened/](hardened/). Browser checks use local synthetic data and substituted Apps Script RPC. No production data access or deployment.

Remaining gaps: physical iOS/Android, Safari, actual keyboard appearance, assistive technology and system text scaling. Native browser error conditions are represented by substituted RPC failures; no automatic mutation retry was introduced.
