# Mobile interface audit

Date: 2026-11-08. Scope: mobile web, Arabic RTL, existing Operate surface. Desktop identity and application code unchanged.

## Implementation integrity verdict

**Pass, with responsive deficiencies.** The navy/gold/ivory tokens, Arabic terminology, labeled forms, navigation states, and role-specific controls form a coherent operational interface. The bundled static detector returned `[]`; it did not identify the rendered failures below. Zero detector findings does not establish mobile usability or accessibility conformance.

## Audit health score

| Dimension | Score / 4 | Evidence |
|---|---:|---|
| Accessibility | 3 | Labels, focus indicators, modal focus trap and focus restoration, inert background, live messages; touch controls mostly reach 44px height. Full conformance untested. |
| Performance | 3 | Small dependency-free interface; reports synchronously rebuild rows on filter input. No device performance profile. |
| Theming | 3 | Shared palette tokens; a few literal colors remain. Dark mode is not an established requirement. |
| Responsive design | 1 | Fragmented table text, stretched navigation, excessive vertical overhead. |
| Implementation integrity | 3 | Consistent product-specific system; layered responsive overrides fail to adapt tabular composition. |
| **Total** | **13/20** | **Acceptable overall; significant mobile work needed.** |

Scores are bounded audit judgments, not a certification. Findings: **0 P0, 2 P1, 3 P2, 0 P3**.

## Evidence and limits

- Actual `Index.html` rendered in local headless Google Chrome with synthetic Arabic admin data: 12 students, one approved meeting, one active season. Only Google Apps Script RPC was substituted; no production reads/writes.
- Viewports: 320, 390, 430, 768, 1440 CSS px wide, height 844. Desktop was a reference capture only.
- Final captures loaded Noto Sans Arabic. `measurements.json` records dimensions and font availability.
- Initial viewport emulation reported `(pointer:coarse) = false`. Those small-control measurements are **not** evidence that phone touch sizing fails. A separate verified coarse-pointer run at 390px is recorded in `touch-measurements.json` and `390-touch-*.png`.
- Visual inspection covered students, attendance, reports, narrow reports, meeting editor, and the corresponding coarse-pointer captures. Settings and student editor dimensions were collected too. Other admin tabs and season editor were source-inspected only.
- Physical iOS/Android, synthesized swipe gestures, virtual keyboard, screen readers, increased text size, real large datasets, and device performance remain untested. Native select rendering may differ on phones.
- No document-wide horizontal overflow at the measured widths. Some panels overflow internally; this alone is not a WCAG failure for a data table.

## Prioritized findings

### P1 — Tables crush content and action labels

**Location:** `Index.html:287`, `Index.html:559`, `Index.html:564`, `Index.html:571`; builders at `Index.html:952`, `Index.html:1009`, `Index.html:1068`, `Index.html:1101`.

**Category:** Responsive / Implementation integrity.

**Evidence:** At 390px, student phone numbers split over lines, group names split mid-word, and تعديل becomes a vertical stack of fragments. Attendance's فتح action also splits into three fragments; its measured width is 42px in the coarse-pointer capture. Twelve student rows occupy a 1,549px table. At 320px, Arabic names fragment still further. See [students](390-students.png), [touch attendance](390-touch-attendance.png), [narrow reports](320-reports.png).

**Cause:** Auto-layout tables try to fit five/six columns; `td` permits `overflow-wrap:anywhere` with only `6ch` minimum width, and buttons permit arbitrary wrapping. Internal overflow containment prevents page overflow but does not preserve readable column widths.

**Impact:** Supervisors must decode names, phone numbers, statuses and actions; scanning students and meetings becomes slow and error-prone.

**Recommendation:** Below the phone breakpoint, present student/meeting/admin rows as labeled compact records with a clear name and separate actions. Keep numeric strings and short action labels intact. For genuinely tabular reports, preserve readable column minimums and use a dedicated horizontal scroll region with an obvious scroll cue; consider a persistent student column. Scope all changes to mobile.

**Standard:** 44px touch width is a usability target; the 42px action is not by itself proof of WCAG 2.5.8 failure. Do not claim a reflow violation merely because a data table scrolls.

**Suggested command:** `$impeccable adapt`.

### P1 — Navigation stretches vertically on short screens

**Location:** `Index.html:191`, `Index.html:390`, `Index.html:607`.

**Category:** Responsive.

**Evidence:** At 390px with coarse pointer, header ends at y=214. On students, main starts at y=282 (about 68px navigation). On attendance, main starts at y=464 (250px navigation). The active tab becomes a tall slab. See [touch attendance](390-touch-attendance.png).

**Cause:** The desktop grid's `min-height:calc(100vh - 82px)` survives the single-column breakpoint. Implicit auto rows distribute spare height; `.main` aligns itself to start while `.side` and its flex children stretch.

**Impact:** Primary content jumps vertically between tabs and unnecessary navigation consumes roughly 30% of the 844px viewport.

**Recommendation:** At the stacked breakpoint use explicit content-sized navigation and content rows, prevent row stretching, and revisit the inherited desktop minimum height. Verify short, empty, and long screens at the same viewport.

**Suggested command:** `$impeccable layout`.

### P2 — Header spends too much phone space on account controls

**Location:** `Index.html:166`, `Index.html:181`, `Index.html:475`, `Index.html:513`, `Index.html:852`.

**Category:** Responsive.

**Evidence:** The coarse-pointer 390px header measures 214px tall before navigation. Branding, account name, season, refresh and logout wrap; logout takes its own row even with short fixture content.

**Impact:** Repeated account chrome delays access to attendance and student tasks; longer user/season names can add more height.

**Recommendation:** Define a compact mobile header layout: identity/account actions grouped deliberately, season on a predictable row, clear refresh access. Retain all actions and desktop composition.

**Suggested command:** `$impeccable adapt`.

### P2 — Report filters push results below the first viewport

**Location:** `Index.html:613`, `Index.html:622`, `Index.html:1062`.

**Category:** Responsive.

**Evidence:** Six report filters stack into six rows at 320px; the panel starts at y=893 and table at y=986 in the regular viewport capture. At 390px coarse-pointer capture, panel starts at y=651. See [320px reports](320-reports.png).

**Impact:** Users see no results initially on smaller phones, despite an already populated report.

**Recommendation:** Keep report kind and key search visible; put secondary date/group/type filters in an accessible expandable section with active-filter count and clear reset behavior. Preserve current filter semantics and defaults.

**Suggested command:** `$impeccable adapt`.

### P2 — Attendance actions follow the whole roster

**Location:** `Index.html:382`, `Index.html:580`, `Index.html:1028`, `Index.html:1042`, `Index.html:1045`.

**Category:** Responsive / task accessibility.

**Evidence:** In the 390px coarse-pointer meeting capture, roster starts around y=504 and extends beyond the 760px dialog. Bulk attendance and save actions are appended after every roster row. Close is also inside the same scrolling surface. See [meeting](390-touch-meeting.png).

**Impact:** After editing an early student, supervisors must traverse the roster to save; the product permits up to 300 students per meeting. The 12-row fixture already requires scrolling to reach actions. The 300-row case was not rendered.

**Recommendation:** Use a mobile dialog structure with a stable heading/close region, independently scrolling content, and a persistent action region. Keep the bulk attendance control near the roster heading. Check keyboard/viewport resizing before shipping.

**Suggested command:** `$impeccable adapt`.

## Systemic pattern and positives

The mobile strategy mainly shrinks columns and wraps text. It needs deliberate mobile composition for records, navigation, and task actions. Adding more `overflow-wrap:anywhere` rules will not resolve this.

Preserve: RTL flow, established tokens and identity, 16px phone form typography, bounded dynamic-height dialogs, focus management, labeled inputs, error announcements, coarse-pointer minimum heights, and contained table overflow. No animation-related problem was found in the inspected source.

## Recommended sequence and acceptance checks

1. **P1 `$impeccable layout`** — stabilize navigation height on empty/short/long screens.
2. **P1/P2 `$impeccable adapt`** — mobile records, compact header, report filters, persistent attendance actions. Preserve desktop styles and all business behavior.
3. **`$impeccable audit`** — repeat at 320/390/430px, actual touch devices, landscape, 200% text, long Arabic labels and a full roster; verify desktop reference at 1440px.
4. **`$impeccable polish`** — final mobile spacing, wrapping, focus visibility and scroll cues.

Acceptance: no broken short action labels or phone numbers; stable content-sized navigation across tabs; useful report output visible without traversing six filters; save/close remain reachable while editing attendance; no page overflow; desktop remains visually unchanged.

You can ask me to run these one at a time, all at once, or in any order you prefer. Re-run `$impeccable audit` after fixes to see your score improve.
