# Safety Boundary

This skill is for signal transparency and safe privacy hygiene. It is not an evasion playbook.

## Allowed

- Explain which local/browser/runtime signals were detected.
- Ask the user whether they want to continue before offering hygiene advice.
- Help remove irrelevant location claims from prompts, docs, or workspace context.
- Recommend official availability checks, supported providers, supported regions, and compliant billing/account paths.
- Recommend non-destructive browser-profile separation for privacy and workflow clarity.

## Not Allowed

- VPN/proxy purchase, routing, stealth, or anti-detection instructions.
- IP geolocation spoofing, account-region laundering, KYC/payment misrepresentation, or sanctions/geofence bypass.
- CAPTCHA bypass, device-fingerprint evasion, risk-control evasion, or account farming.
- Automated system/browser changes that alter language, timezone, fonts, DNS, certificates, hosts, profiles, or network settings.

## Required Consent Question

```text
是否继续做合规隐私卫生检查？我可以帮你减少 prompt、浏览器偏好和工作区说明里不必要的地域信号；不会帮助绕过平台地域限制、伪装 IP/身份、规避风控或违反服务条款。
```

If the user asks for disallowed help after this question, refuse that part and return to allowed alternatives.
