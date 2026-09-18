import type { OutstandingArSegment } from "@/lib/contracts/outstanding-ar";

export type OpsArDialogKey = OutstandingArSegment | "all";

/** 解析运营看板 URL ?ar=，可在 Server / Client 共用 */
export function parseOpsArParam(value: string | null | undefined): OpsArDialogKey | null {
  if (
    value === "all" ||
    value === "ready" ||
    value === "difficult" ||
    value === "pending" ||
    value === "awaiting" ||
    value === "deposit"
  ) {
    return value;
  }
  return null;
}
