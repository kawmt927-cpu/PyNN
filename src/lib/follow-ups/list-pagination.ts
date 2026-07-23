import {
  DEFAULT_UPCOMING_WINDOW_VALUE,
  type UpcomingWindowValue,
} from "@/lib/follow-ups/upcoming-window";

export const FOLLOW_UP_LIST_PAGE_SIZE = 50;

export function parseFollowUpListPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 10_000);
}

export function followUpListPageCount(total: number, pageSize = FOLLOW_UP_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function buildFollowUpsHref(opts: {
  window?: UpcomingWindowValue | string;
  duePage?: number;
  upcomingPage?: number;
}) {
  const params = new URLSearchParams();
  if (opts.window && opts.window !== DEFAULT_UPCOMING_WINDOW_VALUE) {
    params.set("window", opts.window);
  }
  if (opts.duePage && opts.duePage > 1) {
    params.set("duePage", String(opts.duePage));
  }
  if (opts.upcomingPage && opts.upcomingPage > 1) {
    params.set("upcomingPage", String(opts.upcomingPage));
  }
  const q = params.toString();
  return q ? `/follow-ups?${q}` : "/follow-ups";
}

export function sliceFollowUpPage<T>(items: T[], page: number, pageSize = FOLLOW_UP_LIST_PAGE_SIZE) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
