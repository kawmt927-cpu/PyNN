/** 从请求头静默提取客户端 IP（不对销售端展示）。 */
export function getRequestClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return stripIpv6Mapped(first);
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return stripIpv6Mapped(realIp);

  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return stripIpv6Mapped(cfIp);

  return null;
}

function stripIpv6Mapped(ip: string) {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v || v === "unknown") return true;
  if (v === "::1" || v === "localhost") return true;
  if (v.startsWith("127.")) return true;
  if (v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  if (v.startsWith("169.254.")) return true;
  const m = v.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}
