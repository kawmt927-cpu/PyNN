export type DailyReportBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

export type DailyReportSectionTone = "today" | "tomorrow" | "risk" | "default";

export type DailyReportSection = {
  title: string | null;
  tone: DailyReportSectionTone;
  blocks: DailyReportBlock[];
};

export function resolveDailyReportSectionTone(title: string): DailyReportSectionTone {
  if (/明日|明天/.test(title)) return "tomorrow";
  if (/风险|问题/.test(title)) return "risk";
  if (/今日|今天|总结/.test(title)) return "today";
  return "default";
}

/** 解析日报 Markdown（## / ### / 列表 / 段落） */
export function parseDailyReportMarkdown(source: string): DailyReportBlock[] {
  const text = source.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: DailyReportBlock[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      flushList();
      blocks.push({ type: "h2", text: h2[1].trim() });
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      flushList();
      blocks.push({ type: "h3", text: h3[1].trim() });
      continue;
    }

    const li = trimmed.match(/^[-*•]\s+(.+)$/);
    if (li) {
      listItems.push(li[1].trim());
      continue;
    }

    flushList();
    const last = blocks[blocks.length - 1];
    if (last?.type === "paragraph") {
      last.text += `\n${trimmed}`;
    } else {
      blocks.push({ type: "paragraph", text: trimmed });
    }
  }

  flushList();
  return blocks;
}

/** 按一级标题拆成区块，便于分色展示 */
export function groupDailyReportSections(source: string): DailyReportSection[] {
  const blocks = parseDailyReportMarkdown(source);
  if (blocks.length === 0) return [];

  const sections: DailyReportSection[] = [];
  let current: DailyReportSection = {
    title: null,
    tone: "default",
    blocks: [],
  };

  for (const block of blocks) {
    if (block.type === "h2") {
      if (current.title !== null || current.blocks.length > 0) {
        sections.push(current);
      }
      current = {
        title: block.text,
        tone: resolveDailyReportSectionTone(block.text),
        blocks: [],
      };
      continue;
    }
    current.blocks.push(block);
  }

  if (current.title !== null || current.blocks.length > 0) {
    sections.push(current);
  }

  return sections;
}

/** 列表预览：去掉 Markdown 标记后截断 */
export function dailyReportPlainPreview(source: string, maxChars = 140): string {
  const plain = source
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*•]\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  return `${plain.slice(0, maxChars).trimEnd()}…`;
}

export function dailyReportNeedsDetailDialog(source: string): boolean {
  const text = source.trim();
  if (!text) return false;
  if (text.length > 160) return true;
  if ((text.match(/\n/g) ?? []).length >= 2) return true;
  if (/^#{1,3}\s/m.test(text)) return true;
  return false;
}
