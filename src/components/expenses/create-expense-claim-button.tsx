"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, FolderKanban, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createExpenseClaimDraft } from "@/app/(dashboard)/expenses/actions";

type ProjectOption = { id: string; name: string };

type Props = {
  hrefPrefix?: string;
  /** 从项目页发起：直接创建项目报销 */
  projectId?: string;
  projectName?: string;
  projects?: ProjectOption[];
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm";
};

const KINDS = [
  {
    key: "TRAVEL" as const,
    title: "差旅报销",
    desc: "出差交通、住宿、补贴等",
    icon: Plane,
    className: "bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100",
  },
  {
    key: "FEE" as const,
    title: "费用报销",
    desc: "招待、办公等日常费用",
    icon: Briefcase,
    className: "bg-slate-50 text-slate-900 border-slate-200 hover:bg-slate-100",
  },
  {
    key: "PROJECT" as const,
    title: "项目报销",
    desc: "归属到具体项目的费用",
    icon: FolderKanban,
    className: "bg-violet-50 text-violet-900 border-violet-200 hover:bg-violet-100",
  },
];

export function CreateExpenseClaimButton({
  hrefPrefix = "/expenses",
  projectId,
  projectName,
  projects = [],
  label,
  variant = "default",
  size = "default",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"pick" | "project">("pick");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  function create(claimKind: "TRAVEL" | "FEE" | "PROJECT", pid?: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("claimKind", claimKind);
      if (claimKind === "PROJECT") {
        const id = pid || projectId;
        if (!id) {
          window.alert("请选择项目");
          return;
        }
        fd.set("projectId", id);
        if (projectName) fd.set("title", `${projectName} · 报销`);
      }
      const result = await createExpenseClaimDraft(fd);
      if (result.error || !result.id) {
        window.alert(result.error ?? "创建失败");
        return;
      }
      setOpen(false);
      setStep("pick");
      setSelectedProjectId("");
      router.push(`${hrefPrefix}/${result.id}`);
    });
  }

  function handleClick() {
    if (projectId) {
      create("PROJECT", projectId);
      return;
    }
    setStep("pick");
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? "创建中…" : label ?? "新建报销"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setStep("pick");
            setSelectedProjectId("");
          }
        }}
      >
        <DialogContent showCloseButton className="max-w-md space-y-4 p-5">
          <DialogHeader>
            <DialogTitle>
              {step === "pick" ? "选择报销类型" : "选择归属项目"}
            </DialogTitle>
          </DialogHeader>

          {step === "pick" ? (
            <div className="space-y-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.key}
                    type="button"
                    disabled={pending}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${k.className}`}
                    onClick={() => {
                      if (k.key === "PROJECT") {
                        setStep("project");
                        return;
                      }
                      create(k.key);
                    }}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>
                      <span className="block font-medium">{k.title}</span>
                      <span className="mt-0.5 block text-xs opacity-80">{k.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>归属项目 *</Label>
                <select
                  value={selectedProjectId}
                  disabled={pending || projects.length === 0}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">请选择项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {projects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无可选项目</p>
                ) : null}
              </div>
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setStep("pick")}
                >
                  返回
                </Button>
                <Button
                  type="button"
                  disabled={pending || !selectedProjectId}
                  onClick={() => create("PROJECT", selectedProjectId)}
                >
                  开始填写
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
