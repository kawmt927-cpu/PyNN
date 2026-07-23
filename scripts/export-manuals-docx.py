#!/usr/bin/env python3
"""将 docs/manuals 下的 Markdown（含图片/表格）导出为 Word，放到 Downloads。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = Path.home() / "Downloads"

DOCS = [
    (ROOT / "docs/manuals/sales/操作手册.md", "培安CRM-销售操作手册.docx"),
    (ROOT / "docs/manuals/sales/测试用例.md", "培安CRM-销售测试用例.docx"),
    (ROOT / "docs/manuals/project/操作手册.md", "培安CRM-项目操作手册.docx"),
    (ROOT / "docs/manuals/project/测试用例.md", "培安CRM-项目测试用例.docx"),
]


def set_run_font(run, *, bold=False, italic=False, size=11, code=False):
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size)
    run.font.name = "Menlo" if code else "PingFang SC"
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), "宋体" if not code else "宋体")
    if code:
        run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)


def add_inline(paragraph, text: str, *, size=11):
    # **bold** / `code` / plain
    pattern = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`|[^*`]+|\*)")
    for part in pattern.findall(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            run = paragraph.add_run(part[2:-2])
            set_run_font(run, bold=True, size=size)
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, code=True, size=size)
        else:
            run = paragraph.add_run(part)
            set_run_font(run, size=size)


def add_heading(doc: Document, text: str, level: int):
    # strip trailing markdown noise
    text = text.strip()
    p = doc.add_heading("", level=min(level, 3))
    run = p.add_run(text)
    set_run_font(run, bold=True, size={1: 18, 2: 14, 3: 12}.get(level, 12))


def add_paragraph(doc: Document, text: str, *, quote=False):
    p = doc.add_paragraph()
    if quote:
        p.paragraph_format.left_indent = Cm(0.5)
        run_prefix = p.add_run("")
        set_run_font(run_prefix, size=11)
    add_inline(p, text, size=11)
    if quote:
        for run in p.runs:
            run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
    return p


def add_list_item(doc: Document, text: str, ordered: bool, number: int | None = None):
    style = "List Number" if ordered else "List Bullet"
    try:
        p = doc.add_paragraph(style=style)
    except KeyError:
        p = doc.add_paragraph()
        prefix = f"{number}. " if ordered and number else "• "
        p.add_run(prefix)
    # clear default empty run content if any
    if p.runs:
        # keep style bullet/number, just append content
        add_inline(p, text, size=11)
    else:
        add_inline(p, text, size=11)
    return p


def add_image(doc: Document, img_path: Path, alt: str = ""):
    if not img_path.exists():
        add_paragraph(doc, f"[图片缺失: {img_path.name}]")
        return
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    # 限制宽度，避免溢出页面
    width = Inches(5.8)
    try:
        run.add_picture(str(img_path), width=width)
    except Exception as e:
        add_paragraph(doc, f"[图片无法插入 {img_path.name}: {e}]")
        return
    if alt:
        cap = doc.add_paragraph()
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = cap.add_run(alt)
        set_run_font(r, italic=True, size=9)
        r.font.color.rgb = RGBColor(0x66, 0x66, 0x66)


def add_table(doc: Document, rows: list[list[str]]):
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"
    for i, row in enumerate(rows):
        for j in range(cols):
            cell = table.cell(i, j)
            cell.text = ""
            p = cell.paragraphs[0]
            val = row[j] if j < len(row) else ""
            # strip markdown bold in cells for simplicity but keep text
            val = re.sub(r"\*\*([^*]+)\*\*", r"\1", val)
            run = p.add_run(val)
            set_run_font(run, bold=(i == 0), size=9)
    doc.add_paragraph()


def parse_table_block(lines: list[str], start: int) -> tuple[list[list[str]], int]:
    rows: list[list[str]] = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        line = lines[i].strip()
        # skip separator |---|---|
        if re.match(r"^\|[\s:\-|]+\|$", line):
            i += 1
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
        i += 1
    return rows, i


def md_to_docx(md_path: Path, out_path: Path):
    text = md_path.read_text(encoding="utf-8")
    base = md_path.parent
    lines = text.splitlines()
    doc = Document()

    section = doc.sections[0]
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)

    i = 0
    in_code = False
    code_buf: list[str] = []
    ordered_idx = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            if not in_code:
                in_code = True
                code_buf = []
            else:
                in_code = False
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Cm(0.3)
                run = p.add_run("\n".join(code_buf))
                set_run_font(run, code=True, size=9)
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        if not stripped:
            i += 1
            ordered_idx = 0
            continue

        if stripped == "---":
            doc.add_paragraph("—" * 20)
            i += 1
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            add_heading(doc, m.group(2), len(m.group(1)))
            ordered_idx = 0
            i += 1
            continue

        img = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", stripped)
        if img:
            alt, rel = img.group(1), img.group(2)
            add_image(doc, (base / rel).resolve(), alt)
            i += 1
            continue

        if stripped.startswith("|"):
            rows, ni = parse_table_block(lines, i)
            add_table(doc, rows)
            i = ni
            continue

        if stripped.startswith("> "):
            add_paragraph(doc, stripped[2:], quote=True)
            i += 1
            continue

        m = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if m:
            ordered_idx = int(m.group(1))
            add_list_item(doc, m.group(2), ordered=True, number=ordered_idx)
            i += 1
            continue

        if stripped.startswith("- ") or stripped.startswith("* "):
            add_list_item(doc, stripped[2:], ordered=False)
            i += 1
            continue

        add_paragraph(doc, stripped)
        i += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
    print(f"✓ {out_path}")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for src, name in DOCS:
        if not src.exists():
            print(f"MISSING {src}", file=sys.stderr)
            continue
        md_to_docx(src, OUT_DIR / name)
    print(f"输出目录: {OUT_DIR}")


if __name__ == "__main__":
    main()
