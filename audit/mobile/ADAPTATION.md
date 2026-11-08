# Mobile adaptation — verified 2026-11-08

Implemented all five findings from [the audit](AUDIT.md), preserving the existing Arabic RTL identity and business rules.

- Student, meeting, season, group and supervisor tables become labeled records below 560px; phone numbers and short actions stay intact. The same controls and event handlers serve both layouts.
- Stacked navigation uses content-sized rows below 850px. At 390px with coarse pointer, attendance content starts at y=202 instead of y=464; navigation no longer stretches between screens.
- Compact account header measures 148px instead of 214px in the same capture.
- Mobile reports show report kind/search first. The filter disclosure retains selected values, exposes expanded state and counts changed secondary filters. Expanded controls follow DOM keyboard order. Desktop retains the original filter arrangement.
- Reports scroll in a labeled, keyboard-focusable region with a visible Arabic scroll hint; names remain readable.
- Phone and short landscape meeting editors retain heading/close and save actions around an independently scrolling roster. Bulk attendance precedes the roster visually on mobile. Validation feedback scrolls into view.
- `install/Index.txt` is synchronized with `Index.html`.

## Verification

- `node --test tests/*.test.cjs`: **35/35 passed**.
- Impeccable static detector: **zero findings**.
- Both installation copies match their source files.
- Chrome renders at 320, 390, 430, 768 and 1440px; separate verified coarse-pointer captures at 390px.
- Browser regression checks at **320×844, 390×844, 430×844 and 844×390** passed: stable navigation across tabs, no page overflow, student search/empty state, filter disclosure and retained filter behavior, desktop resize, and successful save of a modified **300-student attendance roster**.
- Synthesized CDP touch swipes move the report's horizontal scroll region at all three phone widths.
- Save and close remain inside the viewport at both ends of the 300-student roster, including landscape.
- **All seven 1440px reference PNGs are byte-for-byte identical before/after**: students, attendance, report results, report log, settings, meeting editor and student editor.
- Visually inspected phone records, attendance, reports, expanded filters, meeting actions and landscape roster. Evidence is in [after/](after/).

Reproduce interaction checks using [verify.cjs](verify.cjs) with an existing Playwright installation:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node audit/mobile/verify.cjs
```

No app dependencies added. Verification uses synthetic local data and a substituted Apps Script RPC; no production data was read or changed. Deployment was not performed.

Remaining validation gaps: physical iPhone/Android, Safari, screen readers, virtual keyboard behavior and increased system text size. Chromium touch emulation verifies the exercised gesture, not physical-device parity.
