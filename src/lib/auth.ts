import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone, isValidCnMobile } from "@/lib/phone";
import { isUserActivated } from "@/lib/auth/user-activation";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
    };
    /** 管理员调试切换账号时保留的原管理员信息 */
    impersonator?: { id: string; name: string } | null;
  }
  interface User {
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    impersonatorId?: string;
    impersonatorName?: string;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        phone: { label: "手机号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const phoneRaw = credentials?.phone?.trim() ?? "";
        const password = credentials?.password ?? "";
        if (!phoneRaw || !password) return null;

        const phone = normalizePhone(phoneRaw);
        if (!isValidCnMobile(phone)) return null;

        const user = await prisma.user.findUnique({
          where: { phone },
          include: { personnelProfile: { select: { enabled: true } } },
        });
        if (!user || !isUserActivated(user)) return null;
        if (user.personnelProfile && !user.personnelProfile.enabled) return null;
        if (!user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email ?? user.phone ?? "",
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        // 普通账密登录清除调试身份
        delete token.impersonatorId;
        delete token.impersonatorName;
      }
      if (trigger === "update" && session) {
        // reserved
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        if (token.name) session.user.name = token.name as string;
        if (token.email) session.user.email = token.email as string;
      }
      if (token.impersonatorId && token.impersonatorName) {
        session.impersonator = {
          id: token.impersonatorId,
          name: token.impersonatorName,
        };
      } else {
        session.impersonator = null;
      }
      return session;
    },
  },
};
