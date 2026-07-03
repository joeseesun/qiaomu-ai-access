# Trust Boundary Report

Generated for the initial public release.

## Evidence

- Local unit tests: `npm test` passed on 2026-07-03.
- Skill package validation: `npm run validate:skill` passed on 2026-07-03.
- Trigger eval: `npm run eval:trigger` passed 11/11 cases on 2026-07-03.
- Skill IR export: `npm run export:ir` generated `reports/skill-ir.json` on 2026-07-03.
- Secret scan: `npm run secret:scan` passed on 2026-07-03.
- Live detector smoke run: `npm run detect -- --json` imported `is-china-user` and produced a runtime report on 2026-07-03.
- Local install discovery: `npx skills add . --list` found `qiaomu-ai-access` on 2026-07-03.

## Boundaries

- The skill may read runtime locale/timezone and optional browser-like signals exposed through `is-china-user`.
- It writes only report files when the user or command requests `--output`.
- It does not change system, browser, network, account, payment, or identity settings.
- Optional network probing is off by default and must be explicitly requested.

## Missing Evidence

- Browser DOM/canvas verification is `missing evidence` for the initial CLI-only release.
- Human legal review of upstream dependency licensing is `missing evidence`.
- GitHub social preview image is `missing evidence` unless set manually after publication.
