"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import {
  formatTaxRateLabel,
  groupInvoiceAmountsByTaxRate,
  sumInvoiceRecords,
} from "@/lib/contracts/invoice-summary";
import { formatAmount } from "@/lib/opportunities/funnel";

type InvoiceAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type InvoiceRecord = {
  id: string;
  amount: number;
  taxRatePercent: number;
  invoicedAt: string;
  invoiceNo: string | null;
  notes: string | null;
  recordedBy: { name: string };
  attachments: InvoiceAttachment[];
};

type AddInvoiceAction = (formData: FormData) => Promise<ActionResult>;
type DeleteInvoiceAction = (recordId: string) => Promise<ActionResult>;

type Props = {
  contractId: string;
  totalAmount: number;
  records: InvoiceRecord[];
  canDelete: boolean;
  onAdd: AddInvoiceAction;
  onDelete: DeleteInvoiceAction;
};

const COMMON_TAX_RATES = [1, 3, 6, 13];
const ACCEPT_FILES = "image/*,application/pdf";

function todayDateInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContractInvoicePanel({
  contractId,
  totalAmount,
  records,
  canDelete,
  onAdd,
  onDelete,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ocrPending, setOcrPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const [taxRateInput, setTaxRateInput] = useState("6");
  const [invoiceNoInput, setInvoiceNoInput] = useState("");
  const [invoicedAtInput, setInvoicedAtInput] = useState(todayDateInput());
  const [notesInput, setNotesInput] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<InvoiceRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalInvoiced = useMemo(() => sumInvoiceRecords(records), [records]);
  const byRate = useMemo(() => groupInvoiceAmountsByTaxRate(records), [records]);
  const overAmount = totalInvoiced > totalAmount + 0.01;
  const amountNum = Number(amountInput);
  const taxRateNum = Number(taxRateInput);
  const canSubmit =
    amountInput !== "" &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    taxRateInput !== "" &&
    Number.isFinite(taxRateNum) &&
    taxRateNum >= 0 &&
    taxRateNum <= 100;

  function openDialog() {
    setError(null);
    setOcrHint(null);
    setAmountInput("");
    setTaxRateInput("6");
    setInvoiceNoInput("");
    setInvoicedAtInput(todayDateInput());
    setNotesInput("");
    setPendingFile(null);
    setFormKey((k) => k + 1);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setError(null);
    setOcrHint(null);
    setPendingFile(null);
  }

  async function runOcr(file: File) {
    setOcrPending(true);
    setError(null);
    setOcrHint(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/contracts/${contractId}/invoices/ocr`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as {
        error?: string;
        result?: {
          amount: number | null;
          taxRatePercent: number | null;
          invoiceNo: string | null;
          invoicedAt: string | null;
          notes: string | null;
          confidence: string;
          rawSummary: string | null;
        };
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "识别失败");
      }
      const r = data.result!;
      if (r.amount != null) setAmountInput(String(r.amount));
      if (r.taxRatePercent != null) setTaxRateInput(String(r.taxRatePercent));
      if (r.invoiceNo) setInvoiceNoInput(r.invoiceNo);
      if (r.invoicedAt) setInvoicedAtInput(r.invoicedAt);
      if (r.notes) setNotesInput(r.notes);
      setOcrHint(
        `AI 已回填（置信度 ${r.confidence}${r.rawSummary ? `：${r.rawSummary}` : ""}）。请核对后提交。`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "识别失败");
    } finally {
      setOcrPending(false);
    }
  }

  function onPickFile(file: File | null) {
    setPendingFile(file);
    setError(null);
    setOcrHint(null);
  }

  function handleAdd(formData: FormData) {
    formData.set("contractId", contractId);
    formData.set("amount", amountInput);
    formData.set("taxRatePercent", taxRateInput);
    formData.set("invoicedAt", invoicedAtInput);
    formData.set("invoiceNo", invoiceNoInput);
    formData.set("notes", notesInput);
    if (pendingFile) {
      formData.set("file", pendingFile);
    }
    startTransition(async () => {
      setError(null);
      const result = await onAdd(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      closeDialog();
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const recordId = pendingDelete.id;
    setDeletingId(recordId);
    startDeleteTransition(async () => {
      setError(null);
      const result = await onDelete(recordId);
      if (result.error) {
        setError(result.error);
        setDeletingId(null);
        return;
      }
      setPendingDelete(null);
      setDeletingId(null);
      router.refresh();
    });
  }

  async function uploadExtraFile(invoiceId: string, file: File) {
    setUploadPending(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(
        `/api/contracts/${contractId}/invoices/${invoiceId}/attachments`,
        { method: "POST", body }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "上传失败");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploadPending(false);
      setUploadTargetId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">开票记录</CardTitle>
        <Button type="button" size="sm" onClick={openDialog}>
          登记开票
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p>
              <span className="text-muted-foreground">合同金额</span>{" "}
              <span className="font-medium">{formatAmount(totalAmount)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">已开票合计</span>{" "}
              <span className="font-medium">{formatAmount(totalInvoiced)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">开票进度</span>{" "}
              <span className="font-medium">
                {totalAmount > 0
                  ? `${((totalInvoiced / totalAmount) * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </p>
          </div>
          {byRate.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {byRate.map((row) => (
                <li key={row.taxRatePercent}>
                  {formatTaxRateLabel(row.taxRatePercent)}：
                  <span className="ml-0.5 text-foreground">{formatAmount(row.amount)}</span>
                  <span className="ml-1">（{row.count} 笔）</span>
                </li>
              ))}
            </ul>
          ) : null}
          {overAmount ? (
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              已开票合计超过合同金额（允许），请确认是否为价税合计或补开票。
            </p>
          ) : null}
        </div>

        {error && !dialogOpen && <p className="text-sm text-destructive">{error}</p>}

        <input
          ref={extraFileInputRef}
          type="file"
          accept={ACCEPT_FILES}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            if (file && uploadTargetId) void uploadExtraFile(uploadTargetId, file);
          }}
        />

        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无开票记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">日期</th>
                  <th className="pb-2 pr-4">金额</th>
                  <th className="pb-2 pr-4">税率</th>
                  <th className="pb-2 pr-4">发票号码</th>
                  <th className="pb-2 pr-4">附件</th>
                  <th className="pb-2 pr-4">登记人</th>
                  <th className="pb-2 pr-4">备注</th>
                  <th className="pb-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-b align-top">
                    <td className="py-2 pr-4">{row.invoicedAt.slice(0, 10)}</td>
                    <td className="py-2 pr-4">{formatAmount(row.amount)}</td>
                    <td className="py-2 pr-4">{formatTaxRateLabel(row.taxRatePercent)}</td>
                    <td className="py-2 pr-4">{row.invoiceNo?.trim() || "—"}</td>
                    <td className="py-2 pr-4">
                      {row.attachments.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {row.attachments.map((a) => (
                            <li key={a.id}>
                              <a
                                className="text-primary hover:underline"
                                href={`/api/contracts/${contractId}/invoices/${row.id}/attachments/${a.id}?inline=1`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {a.fileName}
                              </a>
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({formatBytes(a.sizeBytes)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2 pr-4">{row.recordedBy.name}</td>
                    <td className="py-2 pr-4">{row.notes ?? "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-col items-start gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={uploadPending}
                          onClick={() => {
                            setUploadTargetId(row.id);
                            extraFileInputRef.current?.click();
                          }}
                        >
                          {uploadPending && uploadTargetId === row.id ? "上传中…" : "上传附件"}
                        </Button>
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deletePending}
                            onClick={() => setPendingDelete(row)}
                          >
                            {deletingId === row.id ? "删除中…" : "删除"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmDestructiveDialog
          open={Boolean(pendingDelete)}
          title="删除开票记录"
          message={
            pendingDelete
              ? `确定删除 ${pendingDelete.invoicedAt.slice(0, 10)} 登记的开票 ${formatAmount(pendingDelete.amount)}（${formatTaxRateLabel(pendingDelete.taxRatePercent)}）吗？附件将一并删除，此操作不可撤销。`
              : ""
          }
          confirmLabel="删除"
          pending={deletePending}
          onCancel={() => {
            if (!deletePending) setPendingDelete(null);
          }}
          onConfirm={confirmDelete}
        />

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setError(null);
              setOcrHint(null);
              setPendingFile(null);
            }
          }}
        >
          <DialogContent className="max-w-md" showCloseButton>
            <DialogHeader>
              <DialogTitle>登记开票</DialogTitle>
              <DialogDescription>
                可先上传发票图片/PDF 并用 AI 识别回填；合计允许超过合同金额（
                {formatAmount(totalAmount)}，已开票 {formatAmount(totalInvoiced)}）。
              </DialogDescription>
            </DialogHeader>
            <form
              key={formKey}
              action={handleAdd}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd(new FormData(e.currentTarget));
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="invoice-file">发票附件</Label>
                <input
                  ref={fileInputRef}
                  id="invoice-file"
                  type="file"
                  accept={ACCEPT_FILES}
                  className="block w-full text-sm"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!pendingFile || ocrPending || pending}
                    onClick={() => pendingFile && void runOcr(pendingFile)}
                  >
                    {ocrPending ? "识别中…" : "AI 识别并回填"}
                  </Button>
                  {pendingFile ? (
                    <span className="self-center text-xs text-muted-foreground">
                      已选：{pendingFile.name}（{formatBytes(pendingFile.size)}）
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  支持 JPG/PNG 等图片与 PDF。PDF 将先抽取文本再识别；扫描件 PDF 若抽取失败可改用清晰图片。
                </p>
                {ocrHint ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">{ocrHint}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice-amount">开票金额 *</Label>
                <Input
                  id="invoice-amount"
                  name="amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  required
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-tax-rate">税率（几个点）*</Label>
                <Input
                  id="invoice-tax-rate"
                  name="taxRatePercent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  required
                  value={taxRateInput}
                  onChange={(e) => {
                    setTaxRateInput(e.target.value);
                    setError(null);
                  }}
                />
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_TAX_RATES.map((rate) => (
                    <Button
                      key={rate}
                      type="button"
                      size="sm"
                      variant={taxRateInput === String(rate) ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setTaxRateInput(String(rate))}
                    >
                      {rate} 个点
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoicedAt">开票日期 *</Label>
                <Input
                  id="invoicedAt"
                  name="invoicedAt"
                  type="date"
                  required
                  value={invoicedAtInput}
                  onChange={(e) => setInvoicedAtInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoiceNo">发票号码</Label>
                <Input
                  id="invoiceNo"
                  name="invoiceNo"
                  placeholder="可选"
                  value={invoiceNoInput}
                  onChange={(e) => setInvoiceNoInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invoice-notes">备注</Label>
                <Textarea
                  id="invoice-notes"
                  name="notes"
                  rows={3}
                  placeholder="可选"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={pending || ocrPending} onClick={closeDialog}>
                  取消
                </Button>
                <Button type="submit" disabled={pending || ocrPending || !canSubmit}>
                  {pending ? "提交中…" : "确认登记"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
