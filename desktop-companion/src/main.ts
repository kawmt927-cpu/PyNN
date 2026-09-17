import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

type AgentUiStatus = "working" | "done" | "needs-input" | "failed" | "unknown";

interface QuotaSnapshot {
  id: string;
  displayName: string;
  primaryValue: string | null;
  secondaryValue: string | null;
  unit: string | null;
  ok: boolean;
  errorMessage: string | null;
  fallbackUrl: string | null;
  experimental: boolean;
  updatedAt: string;
  usedPercent?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  expectedPacePercent?: number | null;
}

interface AgentSnapshot {
  id: string;
  name: string;
  status: AgentUiStatus;
  detail: string | null;
  updatedAt: string;
}

interface CompanionState {
  agentStatus: AgentUiStatus;
  agents: AgentSnapshot[];
  quotas: QuotaSnapshot[];
  lastUpdated: string;
}

interface GenericHttpProviderConfig {
  id: string;
  displayName: string;
  enabled: boolean;
  auth: { type: string; secretRef?: string };
  request: { method: string; url: string; headers: Record<string, string> };
  parse: {
    mode: string;
    fields: {
      primaryLabel?: string;
      primaryValue: string;
      secondaryValue?: string;
      unit?: string;
    };
  };
  pollSeconds: number;
}

type SecretSource = "keychain" | "localVault" | "env" | "auto" | "none";

interface SettingsStatus {
  cursorApiKeyConfigured: boolean;
  cursorApiKeySource: SecretSource;
  cursorUsageSessionConfigured: boolean;
  cursorUsageSessionSource: SecretSource;
  sessionAuthMode: string;
  browserCookieSource: string;
  autoSessionAvailable: boolean;
  autoSessionSourceLabel: string | null;
  autoSessionDetail: string | null;
  quotaPollSeconds: number;
  cloudAgentsEnabled: boolean;
  notifyWhenUnfocused: boolean;
}

interface NotifyStubPayload {
  title: string;
  body: string;
  status: AgentUiStatus;
  stub: boolean;
}

const statusLabel: Record<AgentUiStatus, string> = {
  working: "工作中",
  done: "已完成",
  "needs-input": "待跟进",
  failed: "失败",
  unknown: "未知",
};

const sourceLabel: Record<SecretSource, string> = {
  keychain: "系统钥匙串",
  localVault: "本地加密仓",
  env: "环境变量",
  auto: "自动导入",
  none: "未配置",
};

const SPENDING_URL = "https://cursor.com/dashboard/spending";

function setDot(status: AgentUiStatus) {
  const dot = document.getElementById("status-dot")!;
  dot.className = `dot status-${status}`;
  // Top icon uses aggregated agent status (same priority as tray color).
  dot.title = statusLabel[status] ?? status;
}

function render(state: CompanionState) {
  setDot(state.agentStatus);

  const agentList = document.getElementById("agent-list")!;
  const empty = document.getElementById("agent-empty")!;
  const agents = state.agents ?? [];
  empty.hidden = agents.length > 0;
  agentList.innerHTML = agents
    .map(
      (a) => `
      <li>
        <div class="row-title">
          <span>${escapeHtml(a.name)}</span>
          <span class="badge badge-${a.status}">${statusLabel[a.status]}</span>
        </div>
        ${a.detail ? `<div class="muted">${escapeHtml(a.detail)}</div>` : ""}
      </li>`
    )
    .join("");

  const quotaList = document.getElementById("quota-list")!;
  quotaList.innerHTML = state.quotas
    .map((q) => {
      if (!q.ok) {
        return `
      <li class="quota-row">
        <div class="row-title">
          <span>${escapeHtml(q.displayName)}</span>
          <strong>—</strong>
        </div>
        <div class="error">${escapeHtml(q.errorMessage ?? "拉取失败")}</div>
        ${
          q.fallbackUrl
            ? `<a class="fallback" href="#" data-url="${escapeHtml(q.fallbackUrl)}">打开 Spending</a>`
            : ""
        }
      </li>`;
      }

      const pct =
        typeof q.usedPercent === "number" && Number.isFinite(q.usedPercent)
          ? Math.max(0, q.usedPercent)
          : parsePercent(q.primaryValue);
      const pace =
        typeof q.expectedPacePercent === "number" && Number.isFinite(q.expectedPacePercent)
          ? Math.min(100, Math.max(0, q.expectedPacePercent))
          : null;
      const fill = pct != null ? Math.min(100, pct) : 0;
      const resetLabel = formatResetTime(q.periodEnd);
      const value = escapeHtml(q.primaryValue ?? "—");
      const unit = q.unit ? ` <span class="quota-unit">${escapeHtml(q.unit)}</span>` : "";
      const bar =
        pct != null
          ? `<div class="usage-bar" title="填充=已用；竖线=按时间进度的预期节奏">
               <div class="usage-bar-fill" style="width:${fill}%"></div>
               ${
                 pace != null
                   ? `<div class="usage-bar-pace" style="left:${pace}%" aria-hidden="true"></div>`
                   : ""
               }
             </div>`
          : "";
      const meta = [
        resetLabel ? `额度重置 ${escapeHtml(resetLabel)}` : null,
        q.secondaryValue ? escapeHtml(q.secondaryValue) : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
      <li class="quota-row">
        <div class="row-title">
          <span>${escapeHtml(q.displayName)}</span>
          <strong class="quota-hero">${value}${unit}</strong>
        </div>
        ${bar}
        ${meta ? `<div class="muted quota-meta">${meta}</div>` : ""}
      </li>`;
    })
    .join("");

  document.getElementById("last-updated")!.textContent =
    `上次更新：${new Date(state.lastUpdated).toLocaleString()}`;

  quotaList.querySelectorAll("a.fallback").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      const url = (el as HTMLElement).dataset.url;
      if (url) await openUrl(url);
    });
  });
}

function parsePercent(primary: string | null): number | null {
  if (!primary) return null;
  const m = primary.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function formatResetTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setFeedback(msg: string, ok: boolean) {
  const el = document.getElementById("settings-feedback")!;
  el.hidden = !msg;
  el.textContent = msg;
  el.className = `status-line ${ok ? "ok-msg" : "error"}`;
}

function showNotifyToast(p: NotifyStubPayload) {
  const el = document.getElementById("notify-toast")!;
  el.hidden = false;
  el.textContent = `${p.title} — ${p.body}${p.stub ? "（通知桩）" : ""}`;
  window.setTimeout(() => {
    el.hidden = true;
  }, 6000);
}

function settingsDialog(): HTMLDialogElement {
  return document.getElementById("settings-dialog") as HTMLDialogElement;
}

function openSettings() {
  const dialog = settingsDialog();
  if (!dialog.open) {
    dialog.showModal();
  }
  void loadSettingsStatus();
  document.getElementById("select-session-mode")?.focus();
}

function renderSettingsStatus(s: SettingsStatus) {
  const usageSrc = sourceLabel[s.cursorUsageSessionSource] ?? s.cursorUsageSessionSource;
  const modeHint =
    s.sessionAuthMode === "manual"
      ? "手动粘贴"
      : s.autoSessionAvailable
        ? `自动可用${s.autoSessionSourceLabel ? ` · ${s.autoSessionSourceLabel}` : ""}`
        : "自动暂不可用";
  document.getElementById("cursor-usage-status")!.textContent = s.cursorUsageSessionConfigured
    ? `状态：已配置（${usageSrc}）— ${modeHint}`
    : `状态：未配置 — ${modeHint}；可点「立即自动导入」或紧急粘贴`;

  const detail = document.getElementById("auto-session-detail");
  if (detail) {
    detail.textContent = s.autoSessionDetail
      ? `自动探测：${s.autoSessionDetail}`
      : "自动探测：—";
  }

  const modeSelect = document.getElementById("select-session-mode") as HTMLSelectElement | null;
  if (modeSelect) modeSelect.value = s.sessionAuthMode || "auto";

  const browserSelect = document.getElementById("select-browser") as HTMLSelectElement | null;
  if (browserSelect) browserSelect.value = s.browserCookieSource || "auto";

  const pollInput = document.getElementById("input-quota-poll") as HTMLInputElement | null;
  if (pollInput && document.activeElement !== pollInput) {
    pollInput.value = String(s.quotaPollSeconds || 120);
  }

  const apiSrc = sourceLabel[s.cursorApiKeySource] ?? s.cursorApiKeySource;
  const keyStatus = document.getElementById("cursor-key-status");
  if (keyStatus) {
    keyStatus.textContent = s.cursorApiKeyConfigured
      ? `状态：已配置（${apiSrc}）— 输入框不回显 · 暂缓路径`
      : "状态：未配置 — API Key 非必填";
  }

  const notifyBox = document.getElementById("input-notify-unfocused") as HTMLInputElement;
  notifyBox.checked = s.notifyWhenUnfocused;

  const cloudBox = document.getElementById("input-cloud-agents") as HTMLInputElement | null;
  if (cloudBox) cloudBox.checked = s.cloudAgentsEnabled;
}

async function loadSettingsStatus() {
  try {
    const s = await invoke<SettingsStatus>("get_settings_status");
    renderSettingsStatus(s);
  } catch (e) {
    document.getElementById("cursor-usage-status")!.textContent = `状态读取失败：${e}`;
  }
}

async function refresh() {
  try {
    const state = await invoke<CompanionState>("get_companion_state");
    render(state);
  } catch (e) {
    const empty = document.getElementById("agent-empty")!;
    empty.hidden = false;
    empty.textContent = `刷新失败：${e}`;
  }
}

async function refreshCustom() {
  const el = document.getElementById("custom-json");
  if (!el) return;
  const list = await invoke<GenericHttpProviderConfig[]>("list_custom_providers");
  el.textContent = JSON.stringify(
    list.length
      ? list
      : {
          hint: "尚无自定义源。点击下方添加示例（默认 disabled）。",
          shape: {
            id: "example",
            displayName: "Example",
            enabled: false,
            auth: { type: "bearer", secretRef: "env:EXAMPLE_API_KEY" },
            request: { method: "GET", url: "https://api.example.com/usage", headers: {} },
            parse: {
              mode: "json_path",
              fields: { primaryLabel: "剩余", primaryValue: "$.remaining", unit: "USD" },
            },
            pollSeconds: 300,
          },
        },
    null,
    2
  );
}

window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-refresh")!.addEventListener("click", () => refresh());
  document.getElementById("btn-settings")!.addEventListener("click", () => openSettings());

  const dialog = settingsDialog();
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  document.getElementById("btn-open-spending")!.addEventListener("click", async () => {
    await openUrl(SPENDING_URL);
  });

  document.getElementById("select-session-mode")!.addEventListener("change", async (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    try {
      const s = await invoke<SettingsStatus>("set_session_auth_mode", { mode });
      renderSettingsStatus(s);
      setFeedback(`已切换会话模式：${mode}`, true);
      await refresh();
    } catch (err) {
      setFeedback(`切换失败：${err}`, false);
    }
  });

  document.getElementById("select-browser")!.addEventListener("change", async (e) => {
    const source = (e.target as HTMLSelectElement).value;
    try {
      const s = await invoke<SettingsStatus>("set_browser_cookie_source", { source });
      renderSettingsStatus(s);
      setFeedback(`已选择浏览器：${source}`, true);
    } catch (err) {
      setFeedback(`设置失败：${err}`, false);
    }
  });

  document.getElementById("input-quota-poll")!.addEventListener("change", async (e) => {
    const seconds = Number((e.target as HTMLInputElement).value);
    try {
      const s = await invoke<SettingsStatus>("set_quota_poll_seconds", { seconds });
      renderSettingsStatus(s);
      setFeedback(`额度刷新间隔：${s.quotaPollSeconds} 秒（自动会话每次刷新会重读）`, true);
    } catch (err) {
      setFeedback(`设置失败：${err}`, false);
    }
  });

  document.getElementById("btn-probe-auto")!.addEventListener("click", async () => {
    try {
      const s = await invoke<SettingsStatus>("probe_auto_session");
      renderSettingsStatus(s);
      setFeedback(s.autoSessionAvailable ? "自动会话可用。" : "自动会话暂不可用 — 见探测详情。", s.autoSessionAvailable);
    } catch (err) {
      setFeedback(`探测失败：${err}`, false);
    }
  });

  document.getElementById("btn-import-auto")!.addEventListener("click", async () => {
    try {
      const s = await invoke<SettingsStatus>("import_auto_session_now");
      renderSettingsStatus(s);
      setFeedback("已自动导入会话并写入钥匙串/本地仓。正在刷新额度…", true);
      await refresh();
    } catch (err) {
      setFeedback(`自动导入失败：${err}`, false);
    }
  });

  document.getElementById("btn-save-usage")!.addEventListener("click", async () => {
    const input = document.getElementById("input-cursor-usage") as HTMLInputElement;
    try {
      const s = await invoke<SettingsStatus>("save_cursor_usage_session", {
        token: input.value,
      });
      input.value = "";
      renderSettingsStatus(s);
      setFeedback("已保存紧急粘贴会话。正在刷新额度…", true);
      await refresh();
    } catch (e) {
      setFeedback(`保存失败：${e}`, false);
    }
  });

  document.getElementById("btn-clear-usage")!.addEventListener("click", async () => {
    try {
      const s = await invoke<SettingsStatus>("clear_cursor_usage_session");
      (document.getElementById("input-cursor-usage") as HTMLInputElement).value = "";
      renderSettingsStatus(s);
      setFeedback("已清除已保存会话（不影响自动探测）。", true);
      await refresh();
    } catch (e) {
      setFeedback(`清除失败：${e}`, false);
    }
  });

  document.getElementById("btn-save-cursor")!.addEventListener("click", async () => {
    const input = document.getElementById("input-cursor-key") as HTMLInputElement;
    try {
      const s = await invoke<SettingsStatus>("save_cursor_api_key", { token: input.value });
      input.value = "";
      renderSettingsStatus(s);
      setFeedback("已保存 API Key（暂缓路径）。若未开启 Cloud Agents，不会用于托盘主色。", true);
      await refresh();
    } catch (e) {
      setFeedback(`保存失败：${e}`, false);
    }
  });

  document.getElementById("btn-clear-cursor")!.addEventListener("click", async () => {
    try {
      const s = await invoke<SettingsStatus>("clear_cursor_api_key");
      (document.getElementById("input-cursor-key") as HTMLInputElement).value = "";
      renderSettingsStatus(s);
      setFeedback("已清除 API Key。", true);
      await refresh();
    } catch (e) {
      setFeedback(`清除失败：${e}`, false);
    }
  });

  document.getElementById("input-notify-unfocused")!.addEventListener("change", async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    try {
      const s = await invoke<SettingsStatus>("set_notify_when_unfocused", { enabled });
      renderSettingsStatus(s);
      setFeedback(enabled ? "已开启未聚焦通知桩。" : "已关闭未聚焦通知。", true);
    } catch (err) {
      setFeedback(`设置失败：${err}`, false);
    }
  });

  document.getElementById("input-cloud-agents")!.addEventListener("change", async (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    try {
      const s = await invoke<SettingsStatus>("set_cloud_agents_enabled", { enabled });
      renderSettingsStatus(s);
      setFeedback(
        enabled
          ? "已启用 Cloud Agents（暂缓路径）。需 API Key；托盘会合并本机与云端状态。"
          : "已关闭 Cloud Agents；仅本机 IDE 状态。",
        true
      );
      await refresh();
    } catch (err) {
      setFeedback(`设置失败：${err}`, false);
    }
  });

  document.getElementById("btn-add-sample")!.addEventListener("click", async () => {
    const sample: GenericHttpProviderConfig = {
      id: "sample-http",
      displayName: "示例 HTTP 源",
      enabled: false,
      auth: { type: "bearer", secretRef: "env:EXAMPLE_API_KEY" },
      request: {
        method: "GET",
        url: "https://httpbin.org/json",
        headers: {},
      },
      parse: {
        mode: "json_path",
        fields: {
          primaryLabel: "slideshow author",
          primaryValue: "$.slideshow.author",
          unit: undefined,
        },
      },
      pollSeconds: 300,
    };
    await invoke("upsert_custom_provider", { provider: sample });
    await refreshCustom();
  });

  await listen("companion://refresh", () => {
    void refresh();
  });

  await listen("companion://open-settings", () => {
    openSettings();
  });

  await listen<CompanionState>("companion://state", (ev) => {
    render(ev.payload);
  });

  await listen<NotifyStubPayload>("companion://notify-stub", (ev) => {
    showNotifyToast(ev.payload);
  });

  await loadSettingsStatus();
  await refresh();
  await refreshCustom();
});
