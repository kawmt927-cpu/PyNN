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
npm install
npm run tauri dev
```

首次启动后，在浮窗点 **设置**（或托盘菜单「设置…」）粘贴 **Kimi 会员 Token**（Cookie `kimi-auth`）→ **保存** → **刷新**。  
不必再依赖终端 / `.env`（仍可作为备用）。

打包：

```bash
npm run tauri build
```

- macOS → `.dmg` / `.app`
- Windows → `.msi` / NSIS（见 `src-tauri/tauri.conf.json`）

## 密钥（不要写进仓库）

| 用途 | 推荐 | 备用环境变量 | 说明 |
| --- | --- | --- | --- |
| **Kimi 会员 · 用量进度（主）** | **应用内设置** | `KIMI_AUTH_TOKEN` | Cookie **`kimi-auth`**（账号 Access Token）。对齐官方桌面「总使用量 / Kimi vs Code」。**不是** `sk-kimi-` |
| Cloud Agents | 应用内设置（可选） | `CURSOR_API_KEY` | Dashboard API Keys |
| Cursor 个人用量 | — | `CURSOR_USAGE_SESSION_TOKEN` | 半官方；失败深链 Spending |
| 开放平台余额（次） | 应用内设置（可选） | `MOONSHOT_API_KEY` | 官方 balance |

**优先路径：** 浮窗「设置 · 凭证」→ 粘贴 → 保存（系统钥匙串；失败则应用数据目录加密本地仓）。密钥**不会**回显、不会打日志、勿贴聊天。  

**备用：** `cp .env.example .env` 后写入 `KIMI_AUTH_TOKEN=`（勿提交）。解析顺序：应用内存储 → 环境变量。

凭证说明：`docs/kimi-membership-credentials.md`（Agent Store）。

## 功能状态（脚手架）

| 模块 | 状态 |
| --- | --- |
| 系统托盘 + 显示/隐藏面板 | ✅ |
| **应用内设置（Kimi Token）** | ✅ 钥匙串 / 本地加密仓 |
| 三色状态占位 / 聚合 | ✅（有 Cursor Key 时拉 Cloud Agents） |
| 额度：Kimi 会员 → Cursor → Kimi 余额 | ✅ 接口桩；有会话则实请求（Cursor 用量仍待 Dashboard 接线） |
| 自定义 HTTP 源 CRUD 内存桩 | ✅ |
| 未聚焦通知 | ⏳ TODO |

## 架构速览

```
src-tauri/src/
  agents/          Cloud Agents 轮询
  providers/       kimi_membership, cursor, kimi_balance, generic_http
  config.rs        secretRef 解析（settings → env）
  secrets.rs       OS keychain + 本地加密仓
  models.rs        DTO + 自定义源配置形状
  lib.rs           tray + Tauri commands + settings IPC
```

方案文档（Agent Store）：`docs/desktop-widget-plan.md`

## 许可

与主仓库相同，除非另有说明。
