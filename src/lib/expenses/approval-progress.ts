import {
  formatApprovalActorDetail,
  type ApprovalProgressNode,
} from "@/components/expenses/expense-approval-progress";
import {
  getClaimActivePath,
  getClaimCurrentStepIndex,
} from "@/lib/expenses/approval-flow";

type ApprovalRow = {
  step: string;
  action: string;
  comment: string | null;
  createdAt: Date;
  actor: { name: string };
};

type ClaimLike = {
  status: string;
  submittedAt: Date | null;
  applicant: { name: string };
  rejectedAt: Date | null;
  rejectReason: string | null;
  flowSnapshot: unknown;
  currentStepIndex: number | null;
  approvals: ApprovalRow[];
  payout?: { paidAt: Date; notes: string | null } | null;
};

export function buildExpenseApprovalProgressNodes(
  claim: ClaimLike
): ApprovalProgressNode[] {
  const path = getClaimActivePath(claim);
  const currentIndex = getClaimCurrentStepIndex(claim);
  const approved = claim.approvals.filter((a) => a.action === "APPROVED");
  const rejectRecord = [...claim.approvals]
    .reverse()
    .find((a) => a.action === "REJECTED");

  const nodes: ApprovalProgressNode[] = [
    {
      key: "submit",
      title: "提交申请",
      state: claim.status === "DRAFT" ? "upcoming" : "done",
      detail: formatApprovalActorDetail({
        at: claim.submittedAt,
        actorName: claim.applicant.name,
      }),
    },
  ];

  path.forEach((step, index) => {
    const used = approved[index] ?? null;
    let state: ApprovalProgressNode["state"] = "upcoming";

    if (claim.status === "PAID") {
      state = "done";
    } else if (claim.status === "REJECTED") {
      if (used) state = "done";
      else if (index === currentIndex || (currentIndex < 0 && index === 0)) {
        state = "rejected";
      } else if (index < currentIndex) {
        state = "done";
      }
    } else if (used || index < currentIndex) {
      state = "done";
    } else if (index === currentIndex) {
      state = "current";
    }

    nodes.push({
      key: step.id || `step-${index}`,
      title: step.name,
      state,
      detail: formatApprovalActorDetail({
        at:
          used?.createdAt ??
          (state === "rejected" ? rejectRecord?.createdAt ?? claim.rejectedAt : null),
        actorName:
          used?.actor.name ??
          (state === "rejected" ? rejectRecord?.actor.name : null),
        comment:
          state === "rejected"
            ? rejectRecord?.comment ?? claim.rejectReason
            : used?.comment,
        suffix:
          state === "current"
            ? "处理中"
            : step.isFinalPayout && claim.status === "PAID"
              ? "已打款"
              : null,
      }),
    });
  });

  return nodes;
}

export function latestExpenseRejectInfo(claim: ClaimLike) {
  const reject = [...claim.approvals]
    .reverse()
    .find((a) => a.action === "REJECTED");
  return {
    reason: claim.rejectReason?.trim() || reject?.comment?.trim() || null,
    actorName: reject?.actor.name ?? null,
    at: claim.rejectedAt ?? reject?.createdAt ?? null,
  };
}
