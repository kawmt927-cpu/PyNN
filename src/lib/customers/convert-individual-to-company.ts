import type { CustomerCategory } from "@prisma/client";
import { assertCustomerNameAvailable } from "@/lib/customers/duplicate-name";
import { prisma } from "@/lib/prisma";

export function assertCustomerCategoryTransitionAllowed(
  from: CustomerCategory,
  to: CustomerCategory
) {
  if (from === to) return;
  if (to === "INDIVIDUAL") {
    throw new Error("公司/医院客户不能改为个人客户");
  }
  if (from === "INDIVIDUAL" && to === "HOSPITAL") {
    throw new Error("个人客户只能转为公司客户，不能直接改为医院");
  }
}

export function parseIndividualToCompanyContactFields(formData: FormData): {
  contactName: string;
  contactPhone: string | null;
} {
  const contactName = formData.get("convertContactName")?.toString().trim() ?? "";
  if (!contactName) {
    throw new Error("请填写联系人姓名（原个人将作为公司联系人）");
  }
  if (contactName.length > 100) {
    throw new Error("联系人姓名不超过 100 字");
  }
  const phoneRaw = formData.get("convertContactPhone")?.toString().trim() ?? "";
  return {
    contactName,
    contactPhone: phoneRaw || null,
  };
}

export async function assertIndividualToCompanyConversion(input: {
  customerId: string;
  companyName: string;
  contactName: string;
}) {
  const companyName = input.companyName.trim();
  const contactName = input.contactName.trim();
  if (!companyName) {
    throw new Error("请填写公司名称");
  }
  if (companyName === contactName) {
    throw new Error("公司名称不能与联系人姓名相同，请填写真实公司名");
  }
  await assertCustomerNameAvailable(companyName, input.customerId);
}

/** 将原个人落为该公司主联系人（有则更新，无则创建） */
export async function upsertPrimaryContactFromPerson(input: {
  customerId: string;
  contactName: string;
  contactPhone: string | null;
}) {
  const existingPrimary = await prisma.contact.findFirst({
    where: { customerId: input.customerId, isPrimary: true },
    select: { id: true },
  });
  const existingAny =
    existingPrimary ??
    (await prisma.contact.findFirst({
      where: { customerId: input.customerId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }));

  if (existingAny) {
    await prisma.$transaction([
      prisma.contact.updateMany({
        where: { customerId: input.customerId, id: { not: existingAny.id } },
        data: { isPrimary: false },
      }),
      prisma.contact.update({
        where: { id: existingAny.id },
        data: {
          name: input.contactName,
          phone: input.contactPhone,
          isPrimary: true,
        },
      }),
    ]);
    return existingAny.id;
  }

  const created = await prisma.contact.create({
    data: {
      customerId: input.customerId,
      name: input.contactName,
      phone: input.contactPhone,
      isPrimary: true,
    },
    select: { id: true },
  });
  return created.id;
}
