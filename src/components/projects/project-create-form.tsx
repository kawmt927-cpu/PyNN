"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { createProject } from "@/app/(dashboard)/projects/actions";

export type LinkableContractOption = {
  id: string;
  title: string;
  contractNo: string | null;
  endUserCustomerId: string;
  endUserCustomerName: string;
};

type Props = {
  linkableContracts: LinkableContractOption[];
};

export function ProjectCreateForm({ linkableContracts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [contractId, setContractId] = useState("");
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [customerTouched, setCustomerTouched] = useState(false);

  const contractOptions = useMemo(
    () => [
      { value: "", label: "不关联合同" },
      ...linkableContracts.map((c) => ({
        value: c.id,
        label: c.contractNo ? `${c.title}（${c.contractNo}）` : c.title,
      })),
    ],
    [linkableContracts]
  );

  function applyContract(nextId: string) {
    setContractId(nextId);
    const contract = linkableContracts.find((c) => c.id === nextId);
    if (!contract) return;
    if (!nameTouched || !name.trim()) {
      setName(contract.title);
    }
    if (!customerTouched || !customerId) {
      setCustomerId(contract.endUserCustomerId);
      setCustomerName(contract.endUserCustomerName);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set("name", name);
    fd.set("notes", notes);
    if (customerId) fd.set("customerId", customerId);
    if (contractId) fd.set("contractId", contractId);

    startTransition(async () => {
      const result = await createProject(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <SelectField
        id="contractId"
        name="contractId"
        label="关联合同（可选）"
        value={contractId}
        onValueChange={applyContract}
        options={contractOptions}
      />
      {linkableContracts.length === 0 ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          暂无可关联合同（需已签署且尚未关联项目）；可不关联，作为内部项目。
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">项目名称</Label>
        <Input
          id="name"
          name="name"
          value={name}
          required
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value);
          }}
        />
      </div>

      <CustomerSearchSelect
        id="customerId"
        name="customerId"
        label="客户（可选）"
        required={false}
        value={customerId}
        selectedLabel={customerName}
        placeholder="不选则为内部/独立项目；输入名称可搜索…"
        onValueChange={(id, option) => {
          setCustomerTouched(true);
          setCustomerId(id);
          setCustomerName(option?.label ?? "");
        }}
      />

      <div className="space-y-2">
        <Label htmlFor="notes">备注</Label>
        <Textarea
          id="notes"
          name="notes"
          value={notes}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "创建中…" : "创建项目"}
      </Button>
    </form>
  );
}
