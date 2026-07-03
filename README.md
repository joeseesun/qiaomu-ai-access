# qiaomu-ai-access

**中文** | [English](#english)

> 用 `is-china-user` 先检测当前运行环境是否带有中国用户信号，再把“是否继续做隐私卫生整理”变成一次明确、合规的确认。

[![Last commit](https://img.shields.io/github/last-commit/joeseesun/qiaomu-ai-access?style=flat-square)](https://github.com/joeseesun/qiaomu-ai-access/commits/main)
[![License](https://img.shields.io/github/license/joeseesun/qiaomu-ai-access?style=flat-square)](LICENSE)

**已验证:** `npm test`、`npm run validate:skill`、`npm run eval:trigger`、`npm run secret:scan`、本地 `npx skills add . --list`。

## 为什么值得用

有些 AI 服务、模型网页或 API 会根据语言、时区、字体、emoji 渲染、网络出口等信号做体验分流或风险判断。这个 skill 不教你绕过服务限制，而是先把这些信号透明地列出来，再提醒 agent 必须先征得你的同意，才能继续做合规的隐私卫生建议。

它适合三个场景：

| 场景 | 你会得到什么 |
|---|---|
| 想知道环境是否像中国用户 | 一份本地检测报告，标出命中的语言、时区、emoji、字体、网络等信号 |
| 想改善 AI 使用体验 | 一份不涉及伪装身份或绕过限制的隐私卫生清单 |
| 想把流程交给 agent | 一个可安装的 Qiaomu skill，强制先检测、再询问、再行动 |

## 安装

```bash
npx skills add joeseesun/qiaomu-ai-access
```

本地开发验证：

```bash
git clone https://github.com/joeseesun/qiaomu-ai-access.git
cd qiaomu-ai-access
npm install
npm run check
```

## 你可以直接这样说

- “用 qiaomu-ai-access 检测我现在是不是会被识别成中国用户”
- “我是中国人，但我想用顶级 AI，先帮我做访问环境信号检查”
- “用 isChinaUser 看看我的浏览器/系统有哪些中国用户特征”
- “检测完之后，问我要不要继续做合规隐私卫生整理”

## 它会做什么

1. 调用上游 npm 包 `is-china-user` 做第一步检测。
2. 输出 `isChinaUser`、语言、时区、emoji、字体、可选网络探针等信号。
3. 生成一段固定的用户确认问题，说明哪些事可以做、哪些事不会做。
4. 用户明确同意后，只提供非破坏、非规避的隐私卫生建议。

## 快速运行

```bash
npm run detect -- --output reports/latest-ai-access-check.md
```

输出 JSON：

```bash
npm run detect -- --json
```

可选网络探针：

```bash
npm run detect -- --include-network --output reports/latest-ai-access-check.md
```

网络探针会加载远程图片资源，结果受代理、浏览器扩展、DNS、企业网络和离线状态影响。默认不启用。

## 安全边界

这个项目可以帮助你：

- 查看本机或浏览器环境里有哪些地域、语言、时区、字体等信号。
- 为了更稳定的英文模型交互，整理 prompt、浏览器语言偏好和工作区说明。
- 检查你是否正在使用官方支持的模型、地区、账号和付费路径。
- 用单独浏览器 profile 管理 AI 工作流，减少不必要的跨站 cookie、历史记录和站点权限混杂。

这个项目不会帮助你：

- 伪装 IP、国籍、居住地、付款地区、KYC 信息或账号归属。
- 绕过地理封锁、制裁、平台风控、验证码、设备指纹或服务条款。
- 提供 VPN/代理购买、反检测、风控规避、账号养号、支付规避教程。
- 自动修改系统语言、时区、浏览器指纹、hosts、DNS、证书或网络配置。

## 上游与许可说明

第一步检测依赖 [yArna/isChinaUser](https://github.com/yArna/isChinaUser) / npm 包 `is-china-user@^1.7.0`。

截至本项目发布时，上游 GitHub 仓库和 npm metadata 没有声明开源许可证。本仓库不内置、不复制上游源码，只把它作为 npm 依赖调用。使用者应自行评估该依赖的许可和合规风险。

## 前置条件

- [ ] Node.js 20+：`node --version`
- [ ] npm：`npm --version`
- [ ] 可安装 agent skills：`npx skills --help`
- [ ] 如需发布到 GitHub：`gh auth status`

## 输出示例

```text
AI access signal check
Status: china-signals-detected

Signals:
- isChinaUser: true
- language: false
- timeZone: true
- emoji: unavailable in this runtime
- font: false
- network: skipped

Consent prompt:
是否继续做合规隐私卫生检查？我可以帮你减少 prompt、浏览器偏好和工作区说明里不必要的地域信号；不会帮助绕过平台地域限制、伪装 IP/身份、规避风控或违反服务条款。
```

## 配置

没有必需环境变量。报告路径由 `--output` 参数显式指定；不传时只输出到终端。

## 开发与验证

```bash
npm test
npm run validate:skill
npm run eval:trigger
npm run export:ir
npm run secret:scan
```

## Troubleshooting

| 问题 | 原因 | 解决 |
|---|---|---|
| `Cannot find package 'is-china-user'` | 还没有安装依赖 | 运行 `npm install` |
| emoji/font 显示 unavailable | 当前是 Node.js 运行时，没有 DOM/canvas | 在真实浏览器里运行上游库，或把结果当作 Node-only 检测 |
| 网络探针返回 `null` | 离线、扩展拦截、DNS 或所有探针都不可达 | 换网络后重跑，或不把网络项作为结论 |
| `npx skills add` 找不到 skill | 安装源或 npm 缓存异常 | 用 `npx skills add https://github.com/joeseesun/qiaomu-ai-access` |

## 贡献

欢迎提交 bug report、边界改进和检测报告格式改进。这个项目不接受绕过平台访问控制、反风控、账号伪装、支付规避或违反服务条款的功能请求。

## 关于向阳乔木

乔向阳，网名向阳乔木，X [`@vista8`](https://x.com/vista8)，GitHub [`@joeseesun`](https://github.com/joeseesun/)，公众号「向阳乔木推荐看」主理人。

- 个人站：[qiaomu.ai](https://qiaomu.ai)
- 博客：[blog.qiaomu.ai](https://blog.qiaomu.ai)
- 乔木推荐：[tuijian.qiaomu.ai](https://tuijian.qiaomu.ai)

## License

MIT. See [LICENSE](LICENSE).

---

<a name="english"></a>

# English

`qiaomu-ai-access` is a Qiaomu agent skill that first checks whether the current runtime carries China-related environment signals through `is-china-user`, then requires explicit user consent before offering safe privacy-hygiene guidance.

It does not help bypass geofencing, sanctions, fraud controls, KYC, payment-region rules, account-region restrictions, CAPTCHA, device fingerprinting, or terms of service.

## Install

```bash
npx skills add joeseesun/qiaomu-ai-access
```

## Run

```bash
npm install
npm run detect -- --output reports/latest-ai-access-check.md
npm run check
```

## Natural Prompts

- "Use qiaomu-ai-access to check whether my environment looks like a China user."
- "Run isChinaUser first, then ask whether I want safe privacy-hygiene advice."
- "Check language, timezone, emoji, font, and optional network signals before using top AI models."

## Boundary

Allowed: local signal transparency, prompt/language preference hygiene, official availability checks, and non-destructive browser-profile organization.

Not allowed: location spoofing, IP masking, account laundering, payment/KYC misrepresentation, risk-control bypass, VPN/proxy tutorials, or automated system/browser fingerprint changes.

## Upstream

Detection depends on [yArna/isChinaUser](https://github.com/yArna/isChinaUser), published to npm as `is-china-user`. The upstream project did not declare a license in GitHub/npm metadata at the time this repository was prepared, so this repo depends on the package without vendoring or copying its source.
