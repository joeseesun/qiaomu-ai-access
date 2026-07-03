# Upstream: yArna/isChinaUser

Source read on 2026-07-03:

- GitHub: https://github.com/yArna/isChinaUser
- Clone commit inspected: `aaf3cc9` (`Update README.md`)
- npm package: `is-china-user`
- npm version inspected: `1.7.0`
- GitHub license metadata: none detected
- npm license metadata: none detected

## What It Detects

The upstream package describes a browser-side detector that combines:

- `navigator.language` and `navigator.languages`
- `Intl.DateTimeFormat().resolvedOptions().timeZone`
- emoji rendering behavior
- common Chinese font availability through canvas
- optional network reachability probes

The default synchronous `isChinaUser()` combines language, timezone, emoji, and font checks. Network probing is async and must be called separately.

## How This Skill Uses It

This project imports the npm package and calls its exported functions. Runtime checks call the package from Node.js. Browser checks inject the installed package bundle from `node_modules` into a temporary Playwright headless-shell page so the upstream DOM/canvas functions can run in a real browser-like context.

Coverage mapping:

| Upstream signal | Skill layer | Default command |
|---|---|---|
| `isChinaByLanguage()` | `runtime` and `browser` | `npm run detect:browser` |
| `isChinaByTimeZone()` | `runtime` and `browser` | `npm run detect:browser` |
| `isChinaByEmoji()` | `browser` | `npm run detect:browser` |
| `isChinaByFont()` | `browser` | `npm run detect:browser` |
| `isChinaByNetwork()` | `network` | `npm run detect:full` only |
| `isChinaUser()` | `runtime` and `browser` aggregate | `npm run detect:browser` |

The browser layer uses a temporary automation context and does not read personal browser profiles, cookies, history, extensions, or logged-in sessions.

Because the upstream package currently has no declared license in GitHub/npm metadata, public documentation in this repo should continue to describe it as an external dependency with a license caveat until upstream declares a license.
