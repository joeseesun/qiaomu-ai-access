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

This project imports the npm package and calls its exported functions. It does not vendor, copy, or modify upstream source code.

Because the upstream package currently has no declared license in GitHub/npm metadata, public documentation in this repo should continue to describe it as an external dependency with a license caveat until upstream declares a license.
