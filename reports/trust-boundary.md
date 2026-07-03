# Trust Boundary Report

Generated for the browser-coverage public release.

## Evidence

- Local unit tests: `npm test` passed on 2026-07-03.
- Browser DOM/canvas smoke gate: `npm run smoke:browser` passed on 2026-07-03 and asserted `browser` coverage is `verified`.
- Full optional smoke run: `npm run detect:full -- --json` passed on 2026-07-03 and produced `runtime+browser+network` coverage.
- Skill package validation: `npm run validate:skill` passed on 2026-07-03.
- Trigger eval: `npm run eval:trigger` passed 11/11 cases on 2026-07-03.
- Skill IR export: `npm run export:ir` generated `reports/skill-ir.json` on 2026-07-03.
- Secret scan: `npm run secret:scan` passed on 2026-07-03.
- Live detector smoke run: `npm run detect -- --json` imported `is-china-user` and produced a runtime report on 2026-07-03.
- Local install discovery: `npx skills add . --list` found `qiaomu-ai-access` on 2026-07-03.

## Boundaries

- The skill may read runtime locale/timezone and browser navigator/Intl/canvas signals exposed through `is-china-user`.
- It writes only report files when the user or command requests `--output`.
- It does not change system, browser, network, account, payment, or identity settings.
- Optional network probing is off by default and must be explicitly requested.

## Missing Evidence

- Browser DOM/canvas verification uses a temporary Playwright headless-shell context and does not inspect a personal browser profile.
- Optional network probe evidence is verified for the current network only; it remains off by default because it sends remote image requests.
- Human legal review of upstream dependency licensing is `missing evidence`.
- GitHub social preview image is `missing evidence` unless set manually after publication.
