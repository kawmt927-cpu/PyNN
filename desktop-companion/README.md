# Desktop Companion (MVP scaffold)

常驻托盘 + 小浮窗：Cloud Agent 状态色标、Cursor / Kimi 额度槽、可自定义 HTTP 额度源。

与仓库内医院 CRM（Next.js）**无关**，独立目录 `desktop-companion/`。

## 要求

- **Windows** 或 **macOS**（目标平台；Linux 可开发但非 MVP 交付）
- [Rust](https://rustup.rs/)（stable）
- Node.js 20+
- Tauri 2 系统依赖：[Prerequisites](https://tauri.app/start/prerequisites/)
  - macOS: Xcode CLT
  - Windows: WebView2 + MSVC build tools

## 快速开始

```bash
cd desktop-companion
cp .env.example .env   # 可选；勿提交真实密钥
npm install
npm run tauri dev
```

打包：

```bash
npm run tauri build
```

- macOS → `.dmg` / `.app`
- Windows → `.msi` / NSIS（见 `src-tauri/tauri.conf.json`）

## 密钥（不要写进仓库）

| 用途 | 环境变量 / secretRef | 说明 |
| --- | --- | --- |
| Cloud Agents 状态 | `CURSOR_API_KEY` | Dashboard → API Keys；`env:CURSOR_API_KEY` |
| Cursor 个人用量（半官方，未完全接线） | `CURSOR_USAGE_SESSION_TOKEN` | 实验；失败时深链 [Spending](https://cursor.com/dashboard/spending)，**不造假数** |
| Kimi 会员额度（主） | `KIMI_CODE_TOKEN` | Code / 会员 token，半官方 `.../usages` |
| Kimi 开放平台余额（次） | `MOONSHOT_API_KEY` | 官方 balance；注意国内/国际 base URL |

后续：`keychain:…` 占位将接到 macOS Keychain / Windows Credential Manager。

示例 `.env`（本地）：

```env
CURSOR_API_KEY=
CURSOR_USAGE_SESSION_TOKEN=
KIMI_CODE_TOKEN=
MOONSHOT_API_KEY=
```

## 功能状态（脚手架）

| 模块 | 状态 |
| --- | --- |
| 系统托盘 + 显示/隐藏面板 | ✅ |
| 三色状态占位 / 聚合 | ✅（有 `CURSOR_API_KEY` 时拉 Cloud Agents） |
| 额度：Kimi 会员 → Cursor → Kimi 余额 | ✅ 接口桩；有 Key 则实请求（Cursor 用量仍待 Dashboard 接线） |
| 自定义 HTTP 源 CRUD 内存桩 | ✅ |
| 未聚焦通知 | ⏳ TODO |
| 钥匙串 | ⏳ TODO |

## 架构速览

```
src-tauri/src/
  agents/          Cloud Agents 轮询
  providers/       kimi_membership, cursor, kimi_balance, generic_http
  config.rs        secretRef 解析（env: / keychain:）
  models.rs        DTO + 自定义源配置形状
  lib.rs           tray + Tauri commands
```

方案文档（Agent Store）：`docs/desktop-widget-plan.md`

## 许可

与主仓库相同，除非另有说明。
