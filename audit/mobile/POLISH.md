# Mobile polish — 2026-11-08

- Matched mobile input/select heights, padding and text rhythm; controls scale with their font size.
- Made form/filter labels consistently 14px and retained 16px input text.
- Tightened record separators and outer spacing without reducing tap targets.
- Aligned settings tabs and section headings with their panel padding.
- Centered empty-record messages with consistent spacing and normal weight.
- Removed redundant mobile declarations touched by this pass.

`Index.html` and `install/Index.txt` are synchronized. Brand, Arabic content, workflows and desktop appearance remain intact.

Verified: **36/36 tests**, phone/landscape interaction checks, synthesized report touch scrolling, 300-student attendance save, long-content and failed-save recovery, empty screens and 200% text stress. Visually inspected phone forms, settings and reports. All seven 1440px desktop captures are byte-identical to the originals. Installation copies and whitespace checks pass.

Final reference captures: [polished/](polished/). Existing [interaction](verify.cjs) and [hardening](harden.cjs) scripts remain reproducible with an existing Playwright installation.

No production deployment. Physical-device, Safari, screen-reader and virtual-keyboard validation remain outstanding.
