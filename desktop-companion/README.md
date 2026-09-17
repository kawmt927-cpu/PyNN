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

1. **Spending 会话（额度 · 自动）**  
   点 **设置**（弹窗）→ 会话方式选 **「自动」**（默认）→ 点 **「立即自动导入会话」**。  
   优先读本机 Cursor `state.vscdb` 的 accessToken；否则读 Chrome/Arc/Edge/Brave 的 `WorkosCursorSessionToken`。  
   macOS 首次可能要授权「完全磁盘访问」或钥匙串「允许」。  
   定时刷新会重读会话，**不必反复粘贴 Cookie**。紧急时才展开手动粘贴。失败只打开 Spending，不造假数字。

2. **本机 Hooks（状态色 · 多 Agent）**  
   见 [`hooks/README.md`](./hooks/README.md)：把模板装到 `~/.cursor/`，跑一轮 Agent，确认 `~/.cursor/desktop-companion-status.json` 的 `agents[]` 有更新。面板按**项目名**列出各 Agent；托盘色圆叠加用量 %。未装 hooks → 托盘灰色「未知」。

不必配置 API Key。设置弹窗 → 高级：可选手动开 Cloud Agents（暂缓）；自定义 HTTP 源一般不必用。

打包：

```bash
npm run tauri build
```

## 密钥（不要写进仓库）

| 用途 | 推荐 | 备用环境变量 | 说明 |
| --- | --- | --- | --- |
| Spending 额度 | **自动：Cursor IDE / 浏览器** | `CURSOR_USAGE_SESSION_TOKEN` | 半官方；失败 → [Spending](https://cursor.com/dashboard/spending)；粘贴仅紧急 |
| Cloud Agents（暂缓） | 高级设置（可选） | `CURSOR_API_KEY` | 默认关闭；非本产品主路径 |

**优先路径：** 设置 → 自动导入会话（可写入钥匙串快照）。密钥**不会**回显、不会打日志、勿贴聊天。

**钥匙串注意：** keyring v3 必须启用 `apple-native` / `windows-native`（见 [`KEYRING.md`](./KEYRING.md)）。自动导入失败时再用紧急粘贴。

## 状态色 + 通知

| 语义 | 色 | 含义（本机 Hooks） |
| --- | --- | --- |
| 工作中 | 琥珀 | `beforeSubmitPrompt` / 工具进行中 |
| 已完成 | 绿 | `stop` → completed |
| 待跟进 | 紫 | **近似**：完成后无新一轮 / 显式 needs-input（非官方 WAITING） |
| 失败 | 红 | `stop` → error / aborted |
| 未知 | 灰 | 未装 hooks / 无状态文件 |

托盘聚合优先级：**失败 → 待跟进 → 已完成 → 全部工作中**。色圆上显示 Spending 已用 % 整数。  
后台按 `agent_poll_seconds`（默认 10s）读本地状态文件。  
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
