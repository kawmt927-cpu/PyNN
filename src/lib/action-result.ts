export type ActionResult = {
  redirectTo?: string;
  error?: string;
  allocationId?: string;
  modelId?: string;
  contractId?: string;
};

export type UserFacingActionError = {
  /** 面向用户的中文说明 */
  message: string;
  /** 原始英文/系统错误，便于调试；与中文相同时为 null */
  detail: string | null;
};

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error == null) return "";
  try {
    return String(error);
  } catch {
    return "";
  }
}

/**
 * Next.js `redirect()` 通过抛出特殊错误实现跳转。
 * 客户端 catch 到后必须原样抛出，否则会显示成 NEXT_REDIRECT「错误」。
 */
export function isNextRedirectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  if (digest.startsWith("NEXT_REDIRECT")) return true;
  const message = rawErrorMessage(error);
  return message === "NEXT_REDIRECT" || message.includes("NEXT_REDIRECT");
}

export function rethrowIfNextRedirect(error: unknown): void {
  if (isNextRedirectError(error)) throw error;
}

/** 将 Server Action / 网络异常转为中文提示，并保留原始错误便于调试 */
export function toUserFacingActionError(
  error: unknown,
  fallback = "提交失败，请重试"
): UserFacingActionError {
  // 调用方应先 rethrow；此处兜底避免误展示
  if (isNextRedirectError(error)) {
    return { message: fallback, detail: null };
  }

  const raw = rawErrorMessage(error).trim();
  if (!raw) {
    return { message: fallback, detail: null };
  }

  let message = fallback;
  if (
    raw.includes("was not found on the server") ||
    raw.includes("failed-to-find-server-action") ||
    /Server Action ["'].+["'] was not found/i.test(raw)
  ) {
    message = "页面已过期，请刷新后重试";
  } else if (
    raw.includes("Failed to fetch") ||
    raw.includes("NetworkError") ||
    raw.includes("Load failed") ||
    raw.includes("network error")
  ) {
    message = "网络异常，请检查网络后重试";
  } else if (
    raw.startsWith("Error:") ||
    raw.includes("Unexpected token") ||
    raw.includes("Internal Server Error") ||
    (/^[A-Za-z]/.test(raw) && /https?:\/\//.test(raw))
  ) {
    message = fallback;
  } else {
    // 已是业务中文错误，直接展示
    message = raw;
  }

  const detail = raw && raw !== message ? raw : null;
  return { message, detail };
}

/** 业务侧已是中文的错误文案 */
export function asUserFacingError(
  message: string | null | undefined
): UserFacingActionError | null {
  if (!message?.trim()) return null;
  return { message: message.trim(), detail: null };
}

/** 兼容旧用法：仅取中文文案 */
export function toUserFacingActionErrorMessage(
  error: unknown,
  fallback = "提交失败，请重试"
): string {
  return toUserFacingActionError(error, fallback).message;
}
