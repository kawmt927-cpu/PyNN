import { cn } from "@/lib/utils";
import {
  groupDailyReportSections,
  type DailyReportBlock,
  type DailyReportSectionTone,
} from "@/lib/sales-log/daily-report-format";

const SECTION_STYLES: Record<
  DailyReportSectionTone,
  { wrap: string; title: string }
> = {
  today: {
    wrap: "border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/40",
    title: "text-sky-900 dark:text-sky-100",
  },
  tomorrow: {
    wrap: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40",
    title: "text-emerald-900 dark:text-emerald-100",
  },
  risk: {
    wrap: "border-orange-200 bg-orange-50/70 dark:border-orange-900 dark:bg-orange-950/40",
    title: "text-orange-900 dark:text-orange-100",
  },
  default: {
    wrap: "border-border bg-muted/30",
    title: "text-foreground",
  },
};

function renderBlocks(blocks: DailyReportBlock[]) {
  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">（无）</p>;
  }

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        if (block.type === "h3") {
          return (
            <h4
              key={`h3-${index}`}
              className="pt-1 text-sm font-semibold text-foreground first:pt-0"
            >
              {block.text}
            </h4>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={`ul-${index}`} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {block.items.map((item, itemIndex) => (
                <li key={`li-${index}-${itemIndex}`} className="whitespace-pre-wrap">
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "paragraph") {
          return (
            <p key={`p-${index}`} className="whitespace-pre-wrap text-sm leading-relaxed">
              {block.text}
            </p>
          );
        }
        // h2 已在分组标题中展示
        return null;
      })}
    </div>
  );
}

type Props = {
  content: string;
  className?: string;
};

/** 将日报 Markdown 按「今日 / 明日 / 风险」等分区块展示 */
export function DailyReportBody({ content, className }: Props) {
  const sections = groupDailyReportSections(content);
  if (sections.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>暂无日报正文。</p>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {sections.map((section, index) => {
        const style = SECTION_STYLES[section.tone];
        return (
          <section
            key={`${section.title ?? "body"}-${index}`}
            className={cn("rounded-lg border px-3.5 py-3", style.wrap)}
          >
            {section.title ? (
              <h3 className={cn("mb-2.5 text-sm font-semibold", style.title)}>
                {section.title}
              </h3>
            ) : null}
            {renderBlocks(section.blocks)}
          </section>
        );
      })}
    </div>
  );
}
