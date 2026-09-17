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

const statusLabel: Record<AgentUiStatus, string> = {
  working: "工作中",
  done: "已完成",
  "needs-input": "待跟进",
  failed: "失败",
  unknown: "未知",
};

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
          <span class="badge">${statusLabel[a.status]}</span>
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
               ? `<a class="fallback" href="#" data-url="${escapeHtml(q.fallbackUrl)}">打开仪表盘</a>`
               : ""
           }`
        : q.secondaryValue
          ? `<div class="muted">${escapeHtml(q.secondaryValue)}</div>`
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

window.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-refresh")!.addEventListener("click", () => refresh());

  document.querySelectorAll<HTMLButtonElement>("[data-demo]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const status = await invoke<AgentUiStatus>("demo_cycle_tray_status", {
        status: btn.dataset.demo,
      });
      setDot(status);
    });
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

  await refresh();
  await refreshCustom();
});
