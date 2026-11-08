# لوحة مركز إحسان

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Supervisors and administrators at Ehsan Center in Jabriya, Kuwait. Supervisors manage students, record attendance, and review reports. Administrators also manage seasons, student groups, and supervisor accounts.

## Product Purpose

An Arabic, right-to-left dashboard for managing student participation and weighted seasonal scores. The core workflow is to configure a season, enroll students, record and approve meeting attendance, then review student records and reports.

## Operating Context

- Runs as a Google Apps Script web app, with data stored in a private Google Sheets file owned by the project owner.
- Uses Kuwait time for dates and membership changes.
- Intended for a small center; each meeting supports at most 300 students.
- Requires no separate hosting or installed libraries for deployment. Local automated checks use Node.js 22 or newer.
- Reports support spreadsheet export and browser printing, including saving to PDF.

## Capabilities and Constraints

- Arabic interface with RTL layout. Default groups are اليافعين، الشباب، الرجال; administrators can change them.
- Seasons define dates, activity types, and weights totaling 100 before activation.
- Attendance can be saved as a draft or approved. Draft, canceled, and future meetings do not contribute to scores.
- Scores combine attendance rates and activity weights. Excused absence earns no points; activity types with no eligible meetings are excluded and available weights are normalized. No score appears when no meeting is eligible.
- Approved meetings preserve their student roster. Later student suspension or group changes must not rewrite historical attendance or scores.
- Approved meeting dates, activity types, and groups are fixed; corrections require cancellation and a replacement meeting. Attendance corrections are recorded.
- Closed seasons prevent meeting edits. Administrators can reopen seasons when needed.
- Supervisors and administrators sign in with application accounts. The underlying Sheets file must remain private.
- No student portal, external messages, or notifications.

## Brand Commitments

- Product name: لوحة مركز إحسان; interface name: مركز إحسان.
- Arabic operational terminology and the Jabriya, Kuwait context are established in the interface.
- Existing project configuration records an approved navy, gold, and light ivory identity. Preserve that commitment unless the user requests a change; implementation details remain in the existing interface.

## Evidence on Hand

- `README.md`: setup, roles, workflows, scoring rules, operational limits, and verification instructions. The user confirmed this repository context during init.
- `Index.html`: incumbent interface, Arabic copy, and accessibility behavior.
- `Code.gs` and `appsscript.json`: server behavior, Google integrations, and Kuwait timezone.
- `tests/server.test.cjs` and `tests/frontend.test.cjs`: local behavioral checks using substitutes for Google services and browser APIs. They do not establish visual or screen-reader conformance.
- `.impeccable/config.json`: existing record of the approved identity. Referenced Instagram materials are not included in the repository.

## Product Principles

- Make student management, attendance entry, and reporting clear for center supervisors.
- Preserve historical records and explain the basis of seasonal scores.
- Keep administrative actions aligned with account roles and season state.
- Keep deployment and operation practical for a small center using Google Apps Script and private Sheets.

## Open Decisions

- No additional product-specific accessibility requirement was supplied during init; existing accessibility behavior remains the implementation baseline, without a conformance claim.
