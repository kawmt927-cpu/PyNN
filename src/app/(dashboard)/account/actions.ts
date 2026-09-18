"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { PRIMARY_NAV } from "@/lib/nav/primary-nav";

const orderSchema = z.array(z.string().min(1).max(64)).max(40);

const KNOWN_NAV_IDS = new Set(PRIMARY_NAV.map((item) => item.id));

export async function saveSidebarNavOrder(order: string[]) {
  const session = await requireSession();
  const parsed = orderSchema.parse(order);
  const cleaned = parsed.filter((id) => KNOWN_NAV_IDS.has(id));

  await prisma.user.update({
    where: { id: session.user.id },
    data: { sidebarNavOrder: cleaned },
  });

  revalidatePath("/", "layout");
  revalidatePath("/account");
}

export async function resetSidebarNavOrder() {
  const session = await requireSession();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { sidebarNavOrder: Prisma.DbNull },
  });

  revalidatePath("/", "layout");
  revalidatePath("/account");
}
