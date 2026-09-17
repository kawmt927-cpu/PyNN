# Desktop Companion (Cursor-only MVP)

常驻托盘 + 小浮窗：

1. **Cursor Spending 额度**（半官方会话；失败深链 Spending，禁止假数字）  
2. **本机 IDE Agent 状态**色标（Hooks → 状态文件；**不是** Cloud Agents API）

**不需要** Cursor API Key 作为主鉴权。Kimi 已暂缓。

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

### 你需要做一次

1. **Spending 会话（额度）**  
   浏览器登录 [Spending](https://cursor.com/dashboard/spending) → DevTools → Cookies → 复制 `WorkosCursorSessionToken` → 浮窗 **设置** → 粘贴 → 保存（钥匙串）。  
   会话过期后重新粘贴；失败只打开 Spending，不造假数字。

2. **本机 Hooks（状态色）**  
   见 [`hooks/README.md`](./hooks/README.md)：把模板装到 `~/.cursor/`，跑一轮 Agent，确认 `~/.cursor/desktop-companion-status.json` 有更新。未装 hooks → 托盘灰色「未知」。

不必配置 API Key。高级折叠里可选手动开 Cloud Agents（暂缓）。

打包：

```bash
npm run tauri build
```

## 密钥（不要写进仓库）

| 用途 | 推荐 | 备用环境变量 | 说明 |
| --- | --- | --- | --- |
| Spending 额度 | **应用内设置（主）** | `CURSOR_USAGE_SESSION_TOKEN` | Cookie 或 JWT；半官方；失败 → [Spending](https://cursor.com/dashboard/spending) |
| Cloud Agents（暂缓） | 高级设置（可选） | `CURSOR_API_KEY` | 默认关闭；非本产品主路径 |

**优先路径：** 设置 → Spending 会话 → 保存（系统钥匙串；失败则加密本地仓）。密钥**不会**回显、不会打日志、勿贴聊天。

**钥匙串注意：** keyring v3 必须启用 `apple-native` / `windows-native`（见 [`KEYRING.md`](./KEYRING.md)）。本地重建后请**重新粘贴保存一次**。

## 状态色 + 通知

| 语义 | 色 | 含义（本机 Hooks） |
| --- | --- | --- |
| 工作中 | 琥珀 | `beforeSubmitPrompt` / 工具进行中 |
| 已完成 | 绿 | `stop` → completed |
| 待跟进 | 紫 | **近似**：完成后无新一轮 |
| 失败 | 红 | `stop` → error / aborted |
| 未知 | 灰 | 未装 hooks / 无状态文件 |

后台按 `agent_poll_seconds`（默认 10s）读本地状态文件；托盘图标随状态变色。  
未聚焦时：完成 / 待跟进 / 失败 发 **通知桩**。

## 功能状态

| 模块 | 状态 |
| --- | --- |
| 系统托盘 + 色标 | ✅ |
| 本机 IDE 状态（hooks 文件） | ✅ MVP spike |
| Spending 会话用量行 | ✅ 半官方 Connect / usage-summary；失败深链 |
| 应用内凭证（钥匙串） | ✅ |
| Cloud Agents 轮询 | ⏸ 暂缓（高级可选，默认关） |
| 未聚焦通知 | ✅ 桩 |
| Kimi | ❌ 暂缓 |
| 自定义 HTTP 源 CRUD | ✅ 桩 |

## 架构速览

```
src-tauri/src/
  local_cursor_status/   本机 hooks 状态文件 + 进程存活
  agents/                聚合（主：本机；可选 cloud）
  providers/             cursor Spending、generic_http
  tray_status.rs         托盘色标
  notify.rs              未聚焦通知桩
  config.rs / secrets.rs 会话钥匙串
hooks/                   Cursor hooks 模板
```

方案文档（Agent Store）：`docs/spending-and-local-status.md`、`docs/cursor-only-mvp.md`、`docs/desktop-widget-plan.md`

## 许可

与主仓库相同，除非另有说明。
