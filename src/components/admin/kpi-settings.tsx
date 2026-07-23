export function KpiSettings() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        此处说明全员统一的 KPI 计数规则。月度 KPI 目标值请在计划与任务 → 指标概览 → 月度中，按销售分别设定。
      </p>

      <section className="space-y-3 rounded-md border bg-muted/30 p-4">
        <div>
          <h3 className="text-base font-semibold">项目开发</h3>
          <p className="mt-1 text-sm text-muted-foreground">影响所有销售的项目开发 KPI 计数口径</p>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground">不再自动计次</strong>
            。当月该销售负责的商机发生阶段往前推进后，会出现在「项目开发 → 核算」列表中。
          </li>
          <li>
            由<strong className="font-medium text-foreground">销售管理或管理员</strong>
            手动勾选是否计入；勾选保存后计 1 次。
          </li>
          <li>
            一次操作跨多级推进在列表中仍为一条记录，勾选后也
            <strong className="font-medium text-foreground">只计 1 次</strong>。
          </li>
          <li>阶段不变、往后退、或新建商机时的首次阶段，不会进入核算列表。</li>
        </ul>
      </section>
    </div>
  );
}
