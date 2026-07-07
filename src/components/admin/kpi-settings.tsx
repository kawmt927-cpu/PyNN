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
            统计当月内，<strong className="font-medium text-foreground">你负责的商机</strong>
            每一次阶段<strong className="font-medium text-foreground">往前推进</strong>
            （按系统配置中商机阶段的排序，新阶段排在后面）计 <strong className="font-medium text-foreground">1 次</strong>。
          </li>
          <li>
            一次操作里<strong className="font-medium text-foreground">跨多级</strong>
            （例如从「初访」直接调到「方案演示」，中间跳过一级）也<strong className="font-medium text-foreground">只计 1 次</strong>，不会按跳了几级重复累加。
          </li>
          <li>分多次、每次往前推一级，则<strong className="font-medium text-foreground">每次各计 1 次</strong>（同一商机可累计）。</li>
          <li>阶段不变、往后退、或新建商机时的首次阶段，均不计入。</li>
          <li>签约本身不计入，除非编辑商机时阶段确实往前变更并留下变更记录。</li>
        </ul>
      </section>
    </div>
  );
}
