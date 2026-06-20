"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { contractFormSchema } from "@/lib/validations/opportunity";
import {
  canManageOpportunityOwner,
  getContractForUser,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { canSignOpportunity } from "@/lib/opportunities/status";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";

function parseOwnerField(raw: FormDataEntryValue | null): string | null {
  const value = raw?.toString().trim() ?? "";
  if (!value || value === POOL_OWNER_VALUE) return null;
  return value;
}

function resolveOwnerId(role: UserRole, userId: string, ownerId: string | null | undefined) {
  if (role === "SALES") return userId;
  if (canManageOpportunityOwner(role) && ownerId) return ownerId;
  return userId;
}

function formatActionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "表单校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败，请重试" };
}

function parseContractForm(formData: FormData) {
  return contractFormSchema.parse({
    title: formData.get("title"),
    totalAmount: formData.get("totalAmount"),
    signingType: formData.get("signingType"),
    signCustomerId: formData.get("signCustomerId"),
    endUserCustomerId: formData.get("endUserCustomerId"),
    ownerId: parseOwnerField(formData.get("ownerId")),
    opportunityId: formData.get("opportunityId") || null,
    signedAt: formData.get("signedAt") || null,
    effectiveAt: formData.get("effectiveAt") || null,
    expiresAt: formData.get("expiresAt") || null,
    notes: formData.get("notes") || undefined,
  });
}

export async function createContract(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseContractForm(formData);
    const ownerId = resolveOwnerId(session.user.role, session.user.id, parsed.ownerId);

    if (parsed.opportunityId) {
      const opportunity = await getOpportunityForUser(
        parsed.opportunityId,
        session.user.role,
        session.user.id
      );
      if (!opportunity) return { error: "关联商机不存在或无权访问" };
      if (!canSignOpportunity(opportunity.status)) {
        return { error: "该商机状态不允许签订销售合同" };
      }
    }

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          title: parsed.title.trim(),
          totalAmount: parsed.totalAmount,
          signingType: parsed.signingType,
          signCustomerId: parsed.signCustomerId,
          endUserCustomerId: parsed.endUserCustomerId,
          ownerId,
          opportunityId: parsed.opportunityId ?? undefined,
          signedAt: parsed.signedAt ? new Date(parsed.signedAt) : undefined,
          effectiveAt: parsed.effectiveAt ? new Date(parsed.effectiveAt) : undefined,
          expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : undefined,
          notes: parsed.notes?.trim() || undefined,
        },
      });

      if (parsed.opportunityId) {
        const opp = await tx.opportunity.findUnique({ where: { id: parsed.opportunityId } });
        if (opp && opp.status === "NOT_SIGNED") {
          await tx.opportunity.update({
            where: { id: parsed.opportunityId },
            data: { status: "SIGNED", amountLocked: true },
          });
        }
      }

      await tx.project.create({
        data: {
          name: created.title,
          customerId: created.endUserCustomerId,
          contractId: created.id,
          status: "PENDING_START",
        },
      });

      return created;
    });

    revalidatePath("/contracts");
    revalidatePath("/opportunities");
    revalidatePath("/projects");
    return { redirectTo: `/contracts/${contract.id}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function createContractFromOpportunity(
  opportunityId: string,
  formData: FormData
): Promise<ActionResult> {
  formData.set("opportunityId", opportunityId);
  return createContract(formData);
}
