"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";

type Props = {
  userId: string;
  userName: string;
  fieldName?: string;
  label?: string;
  confirmMessage?: string;
  action: (formData: FormData) => Promise<void>;
};

export function UnbindWecomButton({
  userId,
  userName,
  fieldName = "id",
  label = "解绑企微",
  confirmMessage,
  action,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const message =
      confirmMessage ?? `确定解绑「${userName}」的企业微信吗？解绑后需重新绑定才能使用企微登录。`;
    if (!confirmDestructiveAction(message)) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set(fieldName, userId);
      await action(formData);
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleClick}>
      {pending ? "解绑中…" : label}
    </Button>
  );
}
