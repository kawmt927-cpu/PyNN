import { UserRole } from "@prisma/client";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export type SessionCookieUser = {
  id: string;
  email: string | null;
  name: string;
  role: UserRole;
  phone?: string | null;
};

export type SessionCookieImpersonator = {
  id: string;
  name: string;
};

function sessionCookieSecure() {
  return process.env.NEXTAUTH_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production";
}

export function sessionCookieName() {
  return sessionCookieSecure()
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

/** 写入与 NextAuth getToken 一致的 JWT session cookie */
export async function createSessionCookie(
  user: SessionCookieUser,
  impersonator?: SessionCookieImpersonator | null
) {
  const { encode } = await import("next-auth/jwt");
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET 未配置");

  const sessionToken = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email ?? user.phone ?? undefined,
      name: user.name,
      role: user.role,
      ...(impersonator
        ? {
            impersonatorId: impersonator.id,
            impersonatorName: impersonator.name,
          }
        : {
            impersonatorId: undefined,
            impersonatorName: undefined,
          }),
    },
    secret,
    maxAge: SESSION_MAX_AGE,
  });

  const secure = sessionCookieSecure();

  return {
    name: sessionCookieName(),
    value: sessionToken,
    options: {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_MAX_AGE,
    },
  };
}
