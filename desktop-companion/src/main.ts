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
  dot.title = statusLabel[status] ?? status;
}

function render(state: CompanionState) {
  setDot(state.agentStatus);
  const summary = document.getElementById("agent-summary")!;
  summary.textContent = `聚合状态：${statusLabel[state.agentStatus]}`;

  const agentList = document.getElementById("agent-list")!;
  agentList.innerHTML = state.agents
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
      const value = q.ok
        ? `${escapeHtml(q.primaryValue ?? "—")}${q.unit ? ` ${escapeHtml(q.unit)}` : ""}`
        : "—";
      const err = !q.ok
        ? `<div class="error">${escapeHtml(q.errorMessage ?? "拉取失败")}</div>
           ${
             q.fallbackUrl
               ? `<a class="fallback" href="#" data-url="${escapeHtml(q.fallbackUrl)}">打开 Spending 仪表盘</a>`
               : ""
           }`
        : q.secondaryValue
          ? `<div class="muted secondary-breakdown">${escapeHtml(q.secondaryValue)}</div>`
          : "";
      return `
      <li>
        <div class="row-title">
          <span>${escapeHtml(q.displayName)}${q.experimental ? " · 半官方" : ""}</span>
          <strong>${value}</strong>
        </div>
        ${err}
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

function renderSettingsStatus(s: SettingsStatus) {
  const usageSrc = sourceLabel[s.cursorUsageSessionSource] ?? s.cursorUsageSessionSource;
  const modeHint =
    s.sessionAuthMode === "manual"
      ? "手动粘贴"
      : s.autoSessionAvailable
        ? `自动可用${s.autoSessionSourceLabel ? ` · ${s.autoSessionSourceLabel}` : ""}`
        : "自动暂不可用";
  document.getElementById("cursor-usage-status")!.textContent = s.cursorUsageSessionConfigured
    ? `状态：已配置（${usageSrc}）— ${modeHint} · 半官方`
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
    document.getElementById("agent-summary")!.textContent = `刷新失败：${e}`;
  }
}

async function refreshCustom() {
  const list = await invoke<GenericHttpProviderConfig[]>("list_custom_providers");
  document.getElementById("custom-json")!.textContent = JSON.stringify(
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

function focusSettings() {
  const panel = document.getElementById("settings-panel")!;
  panel.classList.add("highlight");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("select-session-mode")?.focus();
  window.setTimeout(() => panel.classList.remove("highlight"), 1600);
}

window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-refresh")!.addEventListener("click", () => refresh());
  document.getElementById("btn-settings")!.addEventListener("click", () => focusSettings());

  document.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = await invoke<AgentUiStatus>("demo_cycle_tray_status", {
        status: btn.dataset.demo,
      });
      setDot(status);
    });
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
    focusSettings();
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
