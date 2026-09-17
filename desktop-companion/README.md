# Desktop Companion (Cursor-only MVP)

常驻托盘 + 小浮窗：**Cursor 个人用量**（半官方）+ **Cloud Agent 运行状态**色标。  
Kimi 会员 / 开放平台额度已从主产品路径移除（暂缓）。

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

首次启动后，浮窗点 **设置**（或托盘「设置…」）：

1. **Cursor API Key** → 保存 → 刷新（Cloud Agents 状态色）
2. （可选）**Cursor 用量会话** → 保存（半官方；失败只给 Spending 链）

不必依赖 `.env`（仍可作为备用）。

打包：

```bash
npm run tauri build
```

- macOS → `.dmg` / `.app`
- Windows → `.msi` / NSIS（见 `src-tauri/tauri.conf.json`）

## 密钥（不要写进仓库）

| 用途 | 推荐 | 备用环境变量 | 说明 |
| --- | --- | --- | --- |
| Cloud Agents 状态 | **应用内设置** | `CURSOR_API_KEY` | Dashboard API Keys；托盘色 = 工作中 / 完成 / 待跟进 / 失败 |
| Cursor 个人用量 | 应用内设置（可选） | `CURSOR_USAGE_SESSION_TOKEN` | **半官方**；个人版无稳定公开 API；失败 → [Spending](https://cursor.com/dashboard/spending)，**禁止假数字** |

**优先路径：** 浮窗「设置 · Cursor 凭证」→ 粘贴 → 保存（系统钥匙串；失败则加密本地仓）。密钥**不会**回显、不会打日志、勿贴聊天。

**钥匙串注意：** keyring v3 必须启用 `apple-native` / `windows-native`（见 [`KEYRING.md`](./KEYRING.md)）。本地重建后请**重新粘贴保存一次**。

**备用：** `cp .env.example .env` 后写入上述变量（勿提交）。解析顺序：应用内存储 → 环境变量。

## 状态色 + 通知

| 语义 | 色 | 含义 |
| --- | --- | --- |
| 工作中 | 琥珀 | Agent / Run 进行中 |
| 已完成 | 绿 | Run 结束 |
| 待跟进 | 紫 | IDLE / 等用户 |
| 失败 | 红 | ERROR 等 |

后台按 `agent_poll_seconds`（默认 10s）轮询；托盘图标随聚合状态变色。  
未聚焦时：完成 / 待跟进 / 失败 发 **通知桩**（事件 + 面板提示；OS 通知后续接线）。

## 功能状态

| 模块 | 状态 |
| --- | --- |
| 系统托盘 + 色标 | ✅ |
| Cloud Agents 轮询 | ✅（需 Cursor API Key） |
| Cursor 用量行 | ✅ 半官方桩；失败深链 Spending |
| 应用内 Cursor 凭证 | ✅ 钥匙串 / 本地加密仓 |
| 未聚焦通知 | ✅ 桩（事件 / toast） |
| Kimi 会员 / 开放平台 | ❌ 暂缓，不在当前构建 |
| 自定义 HTTP 源 CRUD | ✅ 内存/配置桩 |

## 架构速览

```
src-tauri/src/
  agents/          Cloud Agents 轮询
  providers/       cursor, generic_http
  tray_status.rs   托盘色标
  notify.rs        未聚焦通知桩
  config.rs        secretRef 解析（settings → env）
  secrets.rs       OS keychain + 本地加密仓
  models.rs        DTO
  lib.rs           tray + poller + settings IPC
```

方案文档（Agent Store）：`docs/desktop-widget-plan.md`、`docs/cursor-only-mvp.md`

## 许可

与主仓库相同，除非另有说明。
