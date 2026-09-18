import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import {
  costLedgerCsv,
  getCostLedger,
  periodQuery,
} from "@/lib/admin/cost-ledger";

export async function GET(request: Request) {
  await requireRole(["ADMIN", "SALES_MANAGER", "HR"]);
  const { searchParams } = new URL(request.url);
  const data = await getCostLedger({
    year: searchParams.get("year"),
    preset: searchParams.get("preset"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  const csv = costLedgerCsv(data.details);
  const qs = periodQuery(data.period);
  const filename = `cost-ledger-${qs || data.period.label}.csv`.replace(
    /[^\w.\-\u4e00-\u9fff]+/g,
    "_"
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
