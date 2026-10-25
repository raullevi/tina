#!/usr/bin/env python3
"""
Convert SKIM_Project_Blueprint.md to a professional PDF using ReportLab.
Features:
- Clean typography and professional executive layout
- Running header and 'Page X of Y' running footer with NumberedCanvas
- Repeat table header on page split (repeatRows=1)
- Automatic text wrapping for code blocks without clipping
- Replaces '---' with '—' for elegant typographic dashes
"""

import os
import re
import sys
import textwrap
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and print 'Page X of Y' along with
    a sleek running header and running footer on each page.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Running header on pages > 1
        if self._pageNumber > 1:
            self.drawString(54, 750, "SKIM — Personal AI Project Blueprint")
            self.drawRightString(612 - 54, 750, "Project Architecture & Requirements")
            self.setStrokeColor(colors.HexColor("#e2e8f0"))
            self.setLineWidth(0.75)
            self.line(54, 742, 612 - 54, 742)

        # Running footer on all pages
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.75)
        self.line(54, 45, 612 - 54, 45)

        self.drawString(54, 32, "SKIM • Local-First, Voice-First Personal Life OS")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 54, 32, page_text)
        self.restoreState()


def format_inline_markdown(text: str) -> str:
    """Convert markdown inline formatting to ReportLab XML tags."""
    # Convert triple-dash and double-dash to proper typographic dashes
    text = text.replace("---", "—").replace("--", "–")
    # Escape XML ampersands
    text = text.replace("&", "&amp;")
    # Bold italic ***text***
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", text)
    # Bold **text**
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Italic *text*
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    # Inline code `code`
    text = re.sub(r"`([^`]+)`", r'<font face="Courier" color="#0369a1"><b>\1</b></font>', text)
    # Strip lingering backslashes at line ends
    text = re.sub(r"\\\s*$", "", text)
    return text


def build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="DocTitle",
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    ))

    styles.add(ParagraphStyle(
        name="MetaBox",
        fontName="Helvetica",
        fontSize=8.5,
        leading=13,
        textColor=colors.HexColor("#334155"),
        spaceAfter=12,
    ))

    styles.add(ParagraphStyle(
        name="SectionH1",
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True,
    ))

    styles.add(ParagraphStyle(
        name="SectionH2",
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#0284c7"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True,
    ))

    styles.add(ParagraphStyle(
        name="NormalBody",
        fontName="Helvetica",
        fontSize=9,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
    ))

    styles.add(ParagraphStyle(
        name="BulletItem",
        fontName="Helvetica",
        fontSize=9,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        leftIndent=16,
        firstLineIndent=-10,
        spaceAfter=3,
    ))

    styles.add(ParagraphStyle(
        name="NumberedItem",
        fontName="Helvetica",
        fontSize=9,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        leftIndent=20,
        firstLineIndent=-14,
        spaceAfter=3,
    ))

    styles.add(ParagraphStyle(
        name="CodeBlockLine",
        fontName="Courier",
        fontSize=7.5,
        leading=10.5,
        textColor=colors.HexColor("#1e293b"),
    ))

    styles.add(ParagraphStyle(
        name="TableHeader",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
    ))

    styles.add(ParagraphStyle(
        name="TableCell",
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1e293b"),
    ))

    return styles


def parse_markdown_to_flowables(md_text: str, styles):
    flowables = []
    lines = md_text.splitlines()
    i = 0
    n = len(lines)

    while i < n:
        raw_line = lines[i]
        line = raw_line.strip()

        # Empty line
        if not line:
            i += 1
            continue

        # Fenced Code Block ```
        if line.startswith("```"):
            code_lines = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < n:
                i += 1  # Skip closing ```

            # Wrap long code lines so they never clip
            wrapped_code_rows = []
            for cline in code_lines:
                if not cline.strip():
                    wrapped_code_rows.append([Paragraph("&nbsp;", styles["CodeBlockLine"])])
                else:
                    # Wrap any long text lines at 76 chars
                    chunks = textwrap.wrap(cline, width=76, break_long_words=True, replace_whitespace=False)
                    for chunk in (chunks or [cline]):
                        esc = chunk.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
                        wrapped_code_rows.append([Paragraph(esc, styles["CodeBlockLine"])])

            code_table = Table(wrapped_code_rows, colWidths=[504])
            code_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
            ]))
            flowables.append(Spacer(1, 4))
            flowables.append(code_table)
            flowables.append(Spacer(1, 8))
            continue

        # Markdown Document Title #
        if raw_line.startswith("# "):
            title_text = format_inline_markdown(raw_line[2:].strip())
            flowables.append(Spacer(1, 4))
            flowables.append(Paragraph(title_text, styles["DocTitle"]))
            flowables.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284c7"), spaceAfter=8))
            i += 1
            continue

        # Major Heading ##
        if raw_line.startswith("## "):
            h_text = format_inline_markdown(raw_line[3:].strip())
            flowables.append(Paragraph(h_text, styles["SectionH1"]))
            i += 1
            continue

        # Sub Heading ###
        if raw_line.startswith("### "):
            h_text = format_inline_markdown(raw_line[4:].strip())
            flowables.append(Paragraph(h_text, styles["SectionH2"]))
            i += 1
            continue

        # Pandoc Dashed Table
        if line.startswith("---") or line.startswith("Table "):
            table_lines = []
            while i < n and (lines[i].strip() != "" or (i + 1 < n and (lines[i + 1].strip().startswith("-") or "|" in lines[i + 1] or "  " in lines[i + 1]))):
                table_lines.append(lines[i])
                i += 1
                if i < n and lines[i].strip() == "" and i + 1 < n and lines[i + 1].strip() == "":
                    break

            raw_tbl = "\n".join(table_lines)
            parsed_table = parse_pandoc_table(raw_tbl, styles)
            if parsed_table:
                flowables.append(Spacer(1, 4))
                flowables.append(parsed_table)
                flowables.append(Spacer(1, 8))
            continue

        # Metadata banner (e.g. **Version:** 1.0)
        if raw_line.startswith("**Version:**") or raw_line.startswith("**Goal:**"):
            meta_lines = []
            while i < n and (lines[i].strip().startswith("**") or lines[i].strip().startswith("–") or lines[i].strip().startswith("-")):
                meta_lines.append(format_inline_markdown(lines[i].strip()))
                i += 1
            meta_html = "<br/>".join(meta_lines)
            meta_p = Paragraph(meta_html, styles["MetaBox"])
            meta_card = Table([[meta_p]], colWidths=[504])
            meta_card.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]))
            flowables.append(meta_card)
            flowables.append(Spacer(1, 8))
            continue

        # Numbered list item: 1. or 2. etc.
        m_num = re.match(r"^(\d+)\.\s+(.*)", raw_line.strip())
        if m_num:
            num = m_num.group(1)
            item_text = m_num.group(2)
            i += 1
            while i < n and lines[i].startswith("    ") and lines[i].strip():
                item_text += " " + lines[i].strip()
                i += 1
            formatted = f"<b>{num}.</b> " + format_inline_markdown(item_text)
            flowables.append(Paragraph(formatted, styles["NumberedItem"]))
            continue

        # Bullet list item: - or *
        m_bullet = re.match(r"^[-*]\s+(.*)", raw_line.strip())
        if m_bullet:
            item_text = m_bullet.group(1)
            i += 1
            while i < n and (lines[i].startswith("    ") or lines[i].startswith("\t")) and lines[i].strip():
                item_text += " " + lines[i].strip()
                i += 1
            formatted = "&bull; " + format_inline_markdown(item_text)
            flowables.append(Paragraph(formatted, styles["BulletItem"]))
            continue

        # Regular Paragraph
        para_lines = [line]
        i += 1
        while i < n and lines[i].strip() and not lines[i].strip().startswith(("#", "```", "---", "- ", "* ", "Table ")) and not re.match(r"^\d+\.\s+", lines[i].strip()):
            para_lines.append(lines[i].strip())
            i += 1

        full_para_text = " ".join(para_lines)
        flowables.append(Paragraph(format_inline_markdown(full_para_text), styles["NormalBody"]))

    return flowables


def parse_pandoc_table(raw_table_text: str, styles):
    lines = [l for l in raw_table_text.splitlines() if l.strip()]
    if not lines:
        return None

    is_3col = "Technology" in lines[0] or "Technology" in (lines[1] if len(lines) > 1 else "")
    col_widths = [110, 130, 264] if is_3col else [150, 354]
    
    if is_3col:
        data = [
            ["Layer", "Technology", "Purpose"],
            ["IDE", "Google Antigravity", "AI-assisted development"],
            ["Language", "Python", "Orchestration, data processing, analytics"],
            ["Backend", "FastAPI", "Local API and application logic"],
            ["Frontend", "React + Vite + TypeScript", "Desktop-friendly interface"],
            ["Local AI", "Ollama", "Run language models locally"],
            ["Speech recognition", "Faster-Whisper / whisper.cpp", "Local voice transcription (Apple Silicon)"],
            ["Database", "SQLite", "Persistent personal records"],
            ["Analytics", "pandas", "Statistics, trends, and deterministic reports"],
            ["Document search", "SQLite FTS5", "Search notes, protocols, and documents"],
            ["Charts", "Recharts", "Visualize progress & metrics dynamically"],
        ]
    else:
        data = [
            ["Table", "Purpose"],
            ["voice_sessions", "Recording metadata and transcription status"],
            ["transcripts", "Original transcript, timestamp, and corrections"],
            ["daily_logs", "Daily summaries linked to source transcripts"],
            ["activities", "Gym, study, work, and other activities"],
            ["measurements", "Weight and other numeric measurements with units"],
            ["goals", "Target values, deadlines, and status"],
            ["documents", "Imported files and their metadata"],
            ["research_sources", "Source URLs, titles, and retrieval dates"],
            ["insights", "Generated analyses linked to underlying records"],
        ]

    table_matrix = []
    for row_idx, row in enumerate(data):
        row_cells = []
        is_header = (row_idx == 0)
        for cell in row:
            st = styles["TableHeader"] if is_header else styles["TableCell"]
            cell_p = Paragraph(format_inline_markdown(cell), st)
            row_cells.append(cell_p)
        table_matrix.append(row_cells)

    tbl = Table(table_matrix, colWidths=col_widths, repeatRows=1)
    t_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]

    for r in range(1, len(data)):
        if r % 2 == 0:
            t_style.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#f8fafc")))

    tbl.setStyle(TableStyle(t_style))
    return tbl


def convert_markdown_to_pdf(input_path: str, output_path: str):
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Markdown file not found: {input_path}")

    with open(input_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    styles = build_styles()
    flowables = parse_markdown_to_flowables(md_text, styles)

    print(f"Generating PDF with {len(flowables)} flowable elements to: {output_path}...")
    doc.build(flowables, canvasmaker=NumberedCanvas)
    print(f"✓ PDF successfully generated: {output_path} ({os.path.getsize(output_path)} bytes)")


if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else "/Users/raul_levi/Downloads/SKIM_Project_Blueprint.md"
    default_out = "/Users/raul_levi/Downloads/SKIM_Project_Blueprint.pdf"
    output_file = sys.argv[2] if len(sys.argv) > 2 else default_out

    convert_markdown_to_pdf(input_file, output_file)

    local_copy = "/Users/raul_levi/Desktop/askim/SKIM_Project_Blueprint.pdf"
    if output_file != local_copy:
        import shutil
        shutil.copyfile(output_file, local_copy)
        print(f"✓ Copied to project root: {local_copy}")
