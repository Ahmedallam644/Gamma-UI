"""
engine/docx_builder.py
=======================
Builds .docx files via Node.js / docx npm package.

Changes from desktop version:
  - _get_base_dir() now resolves to the project root (parent of the engine/
    package) regardless of whether the code is frozen or running from source.
    This is consistent with how ui_interface.py and pptx_builder.py resolve
    their paths in the headless API environment.
  - _build_docx() and _build_docx_brochure() accept **kwargs so the FastAPI
    layer can forward extra parameters without causing TypeErrors.
  - No GUI or desktop-specific code was present here; this file is otherwise
    unchanged from the desktop version.

Polish carried over from desktop version:
  • Heading 1 colour forced to RED (FF0000) for academic mode.
  • Purpose paragraph removed from section slides.
  • Images rendered as simple centered Paragraphs (no table borders).
  • Native TableOfContents replaced with manual paragraph-based TOC (no page numbers).
  • Trifold Landscape brochure builder: 2 pages × 3 columns = 6 panels.
    Panel 1 carries university branding + student names.
"""
import re
import json
import subprocess
from datetime import datetime
from pathlib import Path

from .config import DEFAULT_TEMPLATE
from .ai_logic import _esc


# ── Internal helpers ──────────────────────────────────────────────────────────
def _get_base_dir() -> Path:
    """
    Return the project root directory (the folder that contains the engine/
    package and the node_modules/ directory).

    Works whether the code is:
      - run normally:  __file__ = <root>/engine/docx_builder.py
      - run frozen:    resolved via sys.executable parent
    """
    import sys
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    # __file__ = engine/docx_builder.py  →  parent = engine/  →  parent = <root>
    return Path(__file__).resolve().parent.parent


def _img_block_js(path: str, w: int, h: int) -> str:
    if not path or not Path(path).exists():
        return ""
    abs_p = str(Path(path).resolve()).replace("\\", "/")
    ext   = Path(path).suffix.lower().lstrip(".")
    if ext == "jpg":  ext = "jpeg"
    if ext not in ("jpeg", "png", "gif", "webp"):
        ext = "jpeg"
    return (
        f'(() => {{ try {{ return new ImageRun({{ data: fs.readFileSync("{abs_p}"), '
        f'transformation: {{ width: {w}, height: {h} }}, type: "{ext}" }}); '
        f'}} catch(e) {{ return null; }} }})()'
    )


def _logo_para_js(path: str, side: str) -> str:
    if not path or not Path(path).exists():
        return ""
    abs_p  = str(Path(path).resolve()).replace("\\", "/")
    ext    = Path(path).suffix.lower().lstrip(".")
    if ext == "jpg":  ext = "jpeg"
    if ext not in ("jpeg", "png", "gif", "webp"):
        ext = "jpeg"
    halign = "left" if side == "left" else "right"
    return f"""
      (() => {{
        try {{
          return [new Paragraph({{
            children: [new ImageRun({{
              data: fs.readFileSync("{abs_p}"),
              transformation: {{ width: 80, height: 80 }},
              type: "{ext}",
              floating: {{
                horizontalPosition: {{ relative: "margin", align: "{halign}" }},
                verticalPosition:   {{ relative: "paragraph", offset: 0 }},
                wrap: {{ type: "none" }},
              }},
            }})],
            spacing: {{ before: 0, after: 0 }},
          }})];
        }} catch(e) {{ return []; }}
      }})()"""


def _strip_correct_tags(text: str) -> str:
    """Remove MCQ highlight tags for DOCX output."""
    if not isinstance(text, str):
        text = str(text)
    return re.sub(r'\[\[CORRECT\]\](.*?)\[\[/CORRECT\]\]', r'\1', text)


# ── Template Style Injector ───────────────────────────────────────────────────
def _apply_docx_template_styles(output_path: Path, template_path: Path) -> None:
    """
    Post-process the Node-generated DOCX by copying word/styles.xml (and
    optionally word/theme/theme1.xml) from temp_1.docx into the output file.

    This avoids the SAX "Max buffer length exceeded" crash that the docx.js
    `externalStyles` option causes with complex templates.

    Silently skips if the template file does not exist or any step fails.
    """
    import zipfile, shutil, tempfile

    if not template_path.exists():
        print(f"[Assignment] Template not found, skipping style injection: {template_path.name}")
        return
    if not output_path.exists():
        return

    # Files we want to transplant from the template
    TRANSPLANT = [
        "word/styles.xml",
        "word/theme/theme1.xml",
        "word/fontTable.xml",
    ]

    try:
        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tf:
            tmp_out = Path(tf.name)

        # Read the template parts we need
        tpl_parts: dict[str, bytes] = {}
        with zipfile.ZipFile(template_path, "r") as tz:
            for name in TRANSPLANT:
                try:
                    tpl_parts[name] = tz.read(name)
                except KeyError:
                    pass  # template doesn't have this part — skip

        if not tpl_parts:
            print("[Assignment] Template has no transplantable parts, skipping.")
            return

        # Re-zip the output, replacing matched parts with template versions
        with zipfile.ZipFile(output_path, "r") as src_zip, \
             zipfile.ZipFile(tmp_out, "w", compression=zipfile.ZIP_DEFLATED) as dst_zip:
            for item in src_zip.infolist():
                if item.filename in tpl_parts:
                    dst_zip.writestr(item, tpl_parts[item.filename])
                else:
                    dst_zip.writestr(item, src_zip.read(item.filename))

        shutil.move(str(tmp_out), str(output_path))
        print(f"[Assignment] ✅ Template styles applied from {template_path.name}")

    except Exception as exc:
        print(f"[Assignment] ⚠️  Style injection failed (continuing without it): {exc}")
        try:
            tmp_out.unlink(missing_ok=True)
        except Exception:
            pass


# ── Brochure Builder ──────────────────────────────────────────────────────────
def _build_docx_brochure(
    panels: list, names: list, output_path: Path,
    topic: str, university: str, department: str,
    language: str,
    logo_left_path: str = "",
    **kwargs,
) -> None:
    """
    Build a trifold brochure that visually matches borchor_temp.pdf:
    - A4 Landscape (16838 × 11906 EMU), tiny margins (400 EMU each side)
    - 2 pages × 3 equal columns = 6 panels
    - Each panel: colored header → image → title box → short body text
    - Cover panel: dark navy bg, dual logos, giant title, names, year
    - No page numbers anywhere
    """
    out_path_js = str(output_path.resolve()).replace("\\", "/")
    uni       = _esc(university or "جامعة القاهرة")
    dept      = _esc(department or "كلية التمريض")
    topic_esc = _esc(topic)
    yr        = datetime.now().year
    year_str  = f"{yr}/{yr+1}"

    COLORS = [
        {"panel_bg": "0F4761", "header": "C00000", "sub_header": "156082", "text": "FFFFFF"},
        {"panel_bg": "FFFFFF", "header": "C00000", "sub_header": "0F4761", "text": "1F1F1F"},
        {"panel_bg": "EBF3FB", "header": "156082", "sub_header": "C00000", "text": "1F1F1F"},
        {"panel_bg": "EBF3FB", "header": "0F4761", "sub_header": "C00000", "text": "1F1F1F"},
        {"panel_bg": "FFFFFF", "header": "C00000", "sub_header": "0F4761", "text": "1F1F1F"},
        {"panel_bg": "F2F2F2", "header": "E8B923", "sub_header": "0F4761", "text": "1F1F1F"},
    ]

    # Ensure exactly 6 panels
    while len(panels) < 6:
        n = len(panels)
        panels.append({
            "title":   f"القسم {n}" if language == "Arabic" else f"Section {n}",
            "content": "يُعدّ هذا القسم مكملاً للمحتوى العلمي للمطوية." if language == "Arabic"
                       else "This panel completes the brochure content.",
        })

    def _img_run(path: str, w: int, h: int) -> str:
        if not path or not Path(path).exists():
            return ""
        abs_p = str(Path(path).resolve()).replace("\\", "/")
        ext   = Path(path).suffix.lower().lstrip(".")
        if ext == "jpg":   ext = "jpeg"
        if ext not in ("jpeg", "png", "gif", "webp"): ext = "jpeg"
        return (
            f'new ImageRun({{ data: fs.readFileSync("{abs_p}"), '
            f'transformation: {{ width: {w}, height: {h} }}, type: "{ext}" }})'
        )

    def _shaded_para(text: str, bg: str, txt_color: str,
                     size: int = 24, bold: bool = True,
                     align: str = "CENTER", spacing_before: int = 0,
                     spacing_after: int = 60) -> str:
        return f"""new Paragraph({{
            children: [new TextRun({{ text: `{text}`, bold: {str(bold).lower()},
              size: {size}, color: "{txt_color}", font: "Arial" }})],
            alignment: AlignmentType.{align},
            shading: {{ type: ShadingType.SOLID, color: "{bg}", fill: "{bg}" }},
            spacing: {{ before: {spacing_before}, after: {spacing_after} }},
          }})"""

    def _plain_para(text: str, color: str, size: int = 19,
                    bold: bool = False, align: str = "BOTH",
                    spacing_before: int = 60, spacing_after: int = 60,
                    line: int = 276) -> str:
        return f"""new Paragraph({{
            children: [new TextRun({{ text: `{text}`, bold: {str(bold).lower()},
              size: {size}, color: "{color}", font: "Times New Roman" }})],
            alignment: AlignmentType.{align},
            spacing: {{ before: {spacing_before}, after: {spacing_after}, line: {line} }},
          }})"""

    def _cell_js(idx: int) -> str:
        p    = panels[idx]
        col  = COLORS[idx]
        img  = p.get("image_path", "")
        raw  = p.get("content", "")
        words = raw.split()
        short = " ".join(words[:90]) + ("…" if len(words) > 90 else "")
        content = _esc(short)
        title   = _esc(p.get("title", ""))

        if idx == 0:
            logo_block = ""
            if logo_left_path and Path(logo_left_path).exists():
                img_run = _img_run(logo_left_path, 280, 280)
                logo_block = f"""new Paragraph({{
            children: [{img_run}],
            alignment: AlignmentType.CENTER,
            spacing: {{ before: 120, after: 80 }},
          }}),"""

            cover_img_block = ""
            if img and Path(img).exists():
                img_run = _img_run(img, 1380, 700)
                cover_img_block = f"""new Paragraph({{
            children: [{img_run}],
            alignment: AlignmentType.CENTER,
            spacing: {{ before: 60, after: 60 }},
          }}),"""

            names_block = ""
            for name in names:
                names_block += f"""new Paragraph({{
            children: [new TextRun({{ text: `{_esc(name)}`, size: 20,
              color: "FFD700", font: "Arial" }})],
            alignment: AlignmentType.CENTER,
            spacing: {{ before: 20, after: 20 }},
          }}),
"""
            return f"""
          {_shaded_para(uni,  "0A3550", "FFFFFF", size=22, bold=True,  spacing_before=100, spacing_after=40)},
          {_shaded_para(dept, "0A3550", "FFD700", size=20, bold=True,  spacing_before=0,   spacing_after=80)},
          {logo_block}
          {_shaded_para(topic_esc, "C00000", "FFFFFF", size=34, bold=True, spacing_before=120, spacing_after=120)},
          {cover_img_block}
          {names_block}
          {_shaded_para(year_str, "0A3550", "AAAAAA", size=18, bold=False, spacing_before=80, spacing_after=60)},
"""
        else:
            img_block = ""
            if img and Path(img).exists():
                img_run = _img_run(img, 1380, 800)
                img_block = f"""new Paragraph({{
            children: [{img_run}],
            alignment: AlignmentType.CENTER,
            spacing: {{ before: 0, after: 80 }},
          }}),"""
            return f"""
          {_shaded_para(title, col['header'], "FFFFFF", size=24, bold=True, spacing_before=80, spacing_after=80)},
          {img_block}
          {_shaded_para(title, col['sub_header'], "FFFFFF", size=21, bold=True, align="RIGHT" if language == "Arabic" else "LEFT", spacing_before=60, spacing_after=60)},
          {_plain_para(content, col['text'], size=19, align="RIGHT" if language == "Arabic" else "BOTH", spacing_before=60, spacing_after=60)},
"""

    def _full_cell(idx: int) -> str:
        col = COLORS[idx]
        return f"""new TableCell({{
            width:   {{ size: 3333, type: WidthType.PERCENTAGE }},
            margins: {{ top: 160, bottom: 160, left: 180, right: 180 }},
            shading: {{ type: ShadingType.CLEAR, color: "auto", fill: "{col['panel_bg']}" }},
            borders: {{
              top:    {{ style: BorderStyle.NONE }},
              bottom: {{ style: BorderStyle.NONE }},
              left:   {{ style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" }},
              right:  {{ style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" }},
              insideH: {{ style: BorderStyle.NONE }},
              insideV: {{ style: BorderStyle.NONE }},
            }},
            children: [{_cell_js(idx)}],
          }})"""

    p1 = ", ".join([_full_cell(i) for i in range(3)])
    p2 = ", ".join([_full_cell(i) for i in range(3, 6)])

    js = f"""
const fs = require('fs');
const {{ Document, Packer, Paragraph, TextRun, ImageRun,
         Table, TableRow, TableCell,
         WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak }} = require('docx');

const doc = new Document({{
  sections: [{{
    properties: {{
      page: {{
        size:   {{ width: 16838, height: 11906 }},
        margin: {{ top: 400, right: 400, bottom: 400, left: 400 }},
      }},
    }},
    children: [
      new Table({{
        width: {{ size: 100, type: WidthType.PERCENTAGE }},
        layout: "fixed",
        rows: [ new TableRow({{ children: [{p1}] }}) ],
      }}),
      new Paragraph({{ children: [new PageBreak()] }}),
      new Table({{
        width: {{ size: 100, type: WidthType.PERCENTAGE }},
        layout: "fixed",
        rows: [ new TableRow({{ children: [{p2}] }}) ],
      }}),
    ],
  }}],
}});

Packer.toBuffer(doc)
  .then(buf => {{ fs.writeFileSync("{out_path_js}", buf); console.log("OK:{out_path_js}"); }})
  .catch(err => {{ console.error("ERR:" + err.message); process.exit(1); }});
"""

    base_dir = _get_base_dir()
    tmp = base_dir / "temp_docx_brochure.js"
    tmp.write_text(js, encoding="utf-8")
    try:
        r = subprocess.run(
            ["node", str(tmp)], cwd=str(base_dir),
            capture_output=True, text=True, encoding="utf-8", timeout=120,
        )
        if "OK:" not in r.stdout:
            raise RuntimeError(r.stderr or r.stdout)
        print(f"[Assignment] ✅ Brochure DOCX created: {output_path.name}")
    finally:
        tmp.unlink(missing_ok=True)


# ── Main DOCX Builder ─────────────────────────────────────────────────────────
def _build_docx(
    enriched: dict, names: list, references: list,
    output_path: Path, topic: str,
    supervisor:  str = "", university: str = "",
    department:  str = "", course: str = "",
    language:    str = "Arabic",
    citation_style:    str  = "apa",
    include_abstract:  bool = False,
    abstract_data:     "dict | None" = None,
    cover_image_path:  str  = "",
    logo_left_path:    str  = "",
    logo_right_path:   str  = "",
    template:          "dict | None" = None,
    is_brochure:       bool = False,
    brochure_panels:   "list | None" = None,
    **kwargs,
) -> None:
    # ── Brochure dispatch ────────────────────────────────────────────────────
    if is_brochure:
        _build_docx_brochure(
            panels=brochure_panels or [],
            names=names,
            output_path=output_path,
            topic=topic,
            university=university,
            department=department,
            language=language,
            logo_left_path=logo_left_path,
        )
        return

    tpl      = dict(template or DEFAULT_TEMPLATE)
    title    = _esc(enriched.get("title", topic))
    yr       = datetime.now().year
    year_str = f"{yr}/{yr+1}"
    names_js = json.dumps([_esc(n) for n in names])
    obj_list = enriched.get("objectives", [])
    themes   = enriched.get("key_themes", [])

    C_PRI   = tpl["primary_color"]
    C_SEC   = tpl["secondary_color"]
    C_ACC   = tpl["accent_color"]
    C_GREY  = tpl["grey_color"]
    C_LGREY = tpl["light_grey"]
    C_BGALT = tpl["bg_alt"]
    F_HEAD  = tpl["font_heading"]
    F_BODY  = tpl["font_body"]
    RTL     = tpl.get("rtl", False) or (language == "Arabic")

    H1_COLOR = "FF0000"
    PB_COL   = tpl.get("page_border_color", "0F4761")
    PB_SZ_PT = tpl.get("page_border_size", 8)
    PB_SZ    = PB_SZ_PT * 8

    if language == "Arabic":
        lbl_supervisor   = "تحت إشراف"
        lbl_students     = "أسماء الطلاب"
        lbl_objectives   = "الأهداف التعليمية"
        lbl_themes       = "الموضوعات الرئيسية"
        lbl_toc          = "جدول المحتويات"
        lbl_references   = "المراجع"
        lbl_obj_intro    = "بحلول نهاية هذا البحث، يجب أن يكون الطالب قادراً على:"
        lbl_themes_intro = "تتناول الموضوعات الأساسية التالية في جميع أنحاء هذا البحث:"
        lbl_ref_edition  = "طبعة APA 7"
        lbl_abstract     = "الملخص"
        lbl_keywords     = "الكلمات المفتاحية"
        align_heading    = "AlignmentType.RIGHT"
        align_text       = "AlignmentType.BOTH"
    else:
        lbl_supervisor   = "Under Supervision of"
        lbl_students     = "Student Names"
        lbl_objectives   = "Learning Objectives"
        lbl_themes       = "Key Themes"
        lbl_toc          = "Table of Contents"
        lbl_references   = "References"
        lbl_obj_intro    = "By the end of this assignment, the student should be able to:"
        lbl_themes_intro = "The following core themes run throughout this assignment:"
        lbl_ref_edition  = "APA 7th Edition"
        lbl_abstract     = "Abstract"
        lbl_keywords     = "Keywords"
        align_heading    = "AlignmentType.LEFT"
        align_text       = "AlignmentType.BOTH"

    if cover_image_path and Path(cover_image_path).exists():
        abs_cover = str(Path(cover_image_path).resolve()).replace("\\", "/")
        ext = Path(cover_image_path).suffix.lower().lstrip(".")
        if ext == "jpg":  ext = "jpeg"
        if ext not in ("jpeg", "png", "gif", "webp"):
            ext = "jpeg"
        cover_img_js = f"""
      (() => {{
        try {{
          return [new Paragraph({{
            children: [new ImageRun({{ data: fs.readFileSync("{abs_cover}"),
              transformation: {{ width: 460, height: 258 }}, type: "{ext}" }})],
            alignment: AlignmentType.CENTER, spacing: {{ before: 200, after: 200 }},
          }})];
        }} catch(e) {{ return []; }}
      }})()"""
    else:
        cover_img_js = "[]"

    logo_left_block  = (f"      ...{_logo_para_js(logo_left_path,  'left')},\n"  if logo_left_path  else "")
    logo_right_block = (f"      ...{_logo_para_js(logo_right_path, 'right')},\n" if logo_right_path else "")

    cover_meta_js = ""
    if supervisor:
        cover_meta_js += f"""
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_supervisor}", bold: true, size: 36,
          color: "{C_ACC}", font: "{F_HEAD}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ after: 60 }},
      }}),
      new Paragraph({{
        children: [new TextRun({{ text: `{_esc(supervisor)}`, bold: true, size: 36,
          color: "{C_SEC}", font: "{F_HEAD}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ after: 200 }},
      }}),"""
    for line, color in [(department, C_ACC), (course, C_ACC), (university, C_ACC)]:
        if line:
            cover_meta_js += f"""
      new Paragraph({{
        children: [new TextRun({{ text: `{_esc(line)}`, bold: true, size: 32,
          color: "{color}", font: "{F_HEAD}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ after: 60 }},
      }}),"""
    cover_meta_js += f"""
      new Paragraph({{
        children: [new TextRun({{ text: "{year_str}", bold: true, size: 32,
          color: "{C_ACC}", font: "{F_HEAD}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ after: 100 }},
      }}),"""

    abstract_js = ""
    if include_abstract and abstract_data:
        ab_text = _esc(abstract_data.get("abstract", ""))
        kw_list = abstract_data.get("keywords", [])
        kw_text = _esc("، ".join(kw_list) if language == "Arabic" else ", ".join(kw_list))
        abstract_js = f"""
      new Paragraph({{ children: [new PageBreak()] }}),
      new Paragraph({{ text: "", spacing: {{ before: 400 }} }}),
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_abstract}", bold: true, size: 40,
          font: "{F_HEAD}", color: "{C_PRI}" }})],
        spacing: {{ after: 100 }},
        border: {{ bottom: {{ style: BorderStyle.SINGLE, size: 4,
          color: "{C_PRI}", space: 2 }} }},
        alignment: {align_heading},
      }}),
      new Paragraph({{
        children: [new TextRun({{ text: `{ab_text}`, size: 24, font: "{F_BODY}" }})],
        spacing: {{ line: 360, before: 60, after: 240 }},
        alignment: AlignmentType.BOTH,
        indent: {{ firstLine: 720 }},
      }}),
      new Paragraph({{
        children: [
          new TextRun({{ text: "{lbl_keywords}: ", bold: true, size: 24, font: "{F_HEAD}", color: "{C_PRI}" }}),
          new TextRun({{ text: `{kw_text}`, size: 24, font: "{F_BODY}", italics: true }}),
        ],
        spacing: {{ after: 200 }},
        alignment: {align_heading},
      }}),"""

    obj_js = ""
    for o in obj_list:
        obj_js += f"""
      new Paragraph({{
        numbering: {{ reference: "numbers", level: 0 }},
        children: [new TextRun({{ text: `{_esc(o)}`, size: 24, font: "{F_BODY}" }})],
        spacing: {{ after: 120 }},
      }}),"""

    theme_js = ""
    for t in themes:
        theme_js += f"""
      new Paragraph({{
        children: [
          new TextRun({{ text: `  {_esc(t)}  `, size: 22, bold: true, color: "FFFFFF",
            shading: {{ type: ShadingType.SOLID, color: "1A5276", fill: "1A5276" }} }}),
          new TextRun({{ text: "   " }}),
        ],
        spacing: {{ after: 120 }},
      }}),"""

    toc_js = ""
    for i, section in enumerate(enriched.get("sections", []), 1):
        h = _esc(section["heading"])
        toc_js += f"""
      new Paragraph({{
        children: [new TextRun({{ text: "{i}. {h}", bold: true, size: 26, color: "{C_PRI}", font: "{F_HEAD}" }})],
        spacing: {{ after: 80 }},
        alignment: {align_heading},
      }}),"""
        for j, sub in enumerate(section.get("subheadings", []), 1):
            st = _esc(sub["title"])
            toc_js += f"""
      new Paragraph({{
        children: [new TextRun({{ text: "   {i}.{j} {st}", size: 22, color: "{C_SEC}", font: "{F_BODY}" }})],
        spacing: {{ after: 60 }},
        alignment: {align_heading},
      }}),"""

    section_blocks = ""
    for section in enriched.get("sections", []):
        heading = _esc(section["heading"])
        subs_js = ""

        for sub in section.get("subheadings", []):
            sub_title   = _esc(_strip_correct_tags(sub["title"]))
            sub_content = _esc(_strip_correct_tags(sub.get("content", "")))
            img_path    = sub.get("image_path", "")
            chart_path  = sub.get("chart_path", "")
            eq_paths    = sub.get("equation_paths", [])
            has_img     = img_path   and Path(img_path).exists()   and Path(img_path).stat().st_size   > 300
            has_chart   = chart_path and Path(chart_path).exists() and Path(chart_path).stat().st_size > 300

            media_js = ""

            if has_img:
                abs_img = str(Path(img_path).resolve()).replace("\\", "/")
                ext     = Path(img_path).suffix.lower().lstrip(".")
                if ext == "jpg":  ext = "jpeg"
                if ext not in ("jpeg", "png", "gif", "webp"):
                    ext = "jpeg"
                media_js += f"""
      new Paragraph({{
        children: [new ImageRun({{ data: fs.readFileSync("{abs_img}"),
          transformation: {{ width: 420, height: 236 }}, type: "{ext}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ before: 120, after: 40 }},
      }}),"""

            if has_chart:
                abs_chart = str(Path(chart_path).resolve()).replace("\\", "/")
                ext_c     = Path(chart_path).suffix.lower().lstrip(".")
                if ext_c == "jpg":  ext_c = "jpeg"
                if ext_c not in ("jpeg", "png"):
                    ext_c = "jpeg"
                media_js += f"""
      new Paragraph({{
        children: [new ImageRun({{ data: fs.readFileSync("{abs_chart}"),
          transformation: {{ width: 420, height: 245 }}, type: "{ext_c}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ before: 120, after: 40 }},
      }}),"""

            for eqp in eq_paths:
                if Path(eqp).exists() and Path(eqp).stat().st_size > 200:
                    abs_eq = str(Path(eqp).resolve()).replace("\\", "/")
                    ext_eq = Path(eqp).suffix.lower().lstrip(".")
                    if ext_eq == "jpg":  ext_eq = "jpeg"
                    if ext_eq not in ("jpeg", "png"):
                        ext_eq = "jpeg"
                    media_js += f"""
      new Paragraph({{
        children: [new ImageRun({{ data: fs.readFileSync("{abs_eq}"),
          transformation: {{ width: 300, height: 60 }}, type: "{ext_eq}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ before: 80, after: 80 }},
      }}),"""

            subs_js += f"""
      new Paragraph({{
        children: [new TextRun({{ text: `{sub_title}`, size: 28, bold: true,
          color: "{C_PRI}", font: "{F_HEAD}" }})],
        heading: HeadingLevel.HEADING_2,
        spacing: {{ before: 280, after: 100 }},
        alignment: {align_heading},
      }}),
{media_js}
      new Paragraph({{
        children: [new TextRun({{ text: `{sub_content}`, size: 24, font: "{F_BODY}" }})],
        spacing: {{ line: 360, before: 60, after: 240 }},
        alignment: AlignmentType.BOTH,
        indent: {{ firstLine: 720 }},
      }}),"""

        section_blocks += f"""
      new Paragraph({{ children: [new PageBreak()] }}),
      new Paragraph({{
        children: [new TextRun({{ text: `{heading}`, size: 40, bold: true,
          color: "{H1_COLOR}", font: "{F_HEAD}" }})],
        heading: HeadingLevel.HEADING_1,
        spacing: {{ before: 360, after: 80 }},
        alignment: {align_heading},
      }}),
{subs_js}"""

    ref_type_map = {
        "journal": ("1A5276", "Journal"),
        "book":    ("145A32", "Book"),
        "web":     ("6E2F1A", "Web"),
    }
    ref_js = ""
    for i, ref in enumerate(references):
        if isinstance(ref, dict):
            rtype, rapa = ref.get("type", "journal"), _esc(ref.get("apa", ""))
        else:
            rtype, rapa = "journal", _esc(str(ref))
        color, label = ref_type_map.get(rtype, ("1A5276", "Journal"))
        fill = C_BGALT if i % 2 == 0 else "FFFFFF"
        ref_js += f"""
      new Paragraph({{
        children: [
          new TextRun({{ text: " {label} ", size: 18, bold: true, color: "FFFFFF",
            shading: {{ type: ShadingType.SOLID, color: "{color}", fill: "{color}" }} }}),
          new TextRun({{ text: "  " }}),
          new TextRun({{ text: "[{i+1}]  ", bold: true, size: 22, color: "{C_PRI}" }}),
          new TextRun({{ text: `{rapa}`, size: 22, font: "{F_BODY}" }}),
        ],
        spacing: {{ before: 100, after: 100 }},
        indent: {{ left: 720, hanging: 720 }},
        shading: {{ type: ShadingType.CLEAR, color: "auto", fill: "{fill}" }},
        border: {{ bottom: {{ style: BorderStyle.SINGLE, size: 1,
          color: "{C_LGREY}", space: 1 }} }},
      }}),"""

    out_path_js = str(output_path.resolve()).replace("\\", "/")

    if PB_SZ > 0:
        page_borders_block = f"""
      pageBorders: {{
        display: PageBorderDisplay.ALL_PAGES,
        top:    {{ style: BorderStyle.SINGLE, size: {PB_SZ}, color: "{PB_COL}", space: 20 }},
        bottom: {{ style: BorderStyle.SINGLE, size: {PB_SZ}, color: "{PB_COL}", space: 20 }},
        left:   {{ style: BorderStyle.SINGLE, size: {PB_SZ}, color: "{PB_COL}", space: 20 }},
        right:  {{ style: BorderStyle.SINGLE, size: {PB_SZ}, color: "{PB_COL}", space: 20 }},
      }},"""
    else:
        page_borders_block = ""

    header_footer_block = ""

    js = f"""
const fs = require('fs');
const {{ Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType,
         PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
         Header, Footer, PageNumber, LevelFormat, TabStopType, PageBorderDisplay,
         TableOfContents, PageNumberFormat }} = require('docx');

const names   = {names_js};
const outPath = "{out_path_js}";

const border   = {{ style: BorderStyle.SINGLE, size: 1, color: "{C_LGREY}" }};
const cellBord = {{ top: border, bottom: border, left: border, right: border }};

const doc = new Document({{
  numbering: {{
    config: [{{ reference: "numbers", levels: [{{
      level: 0, format: LevelFormat.DECIMAL, text: "%1.",
      alignment: AlignmentType.LEFT,
      style: {{ paragraph: {{ indent: {{ left: 480, hanging: 360 }},
               spacing: {{ after: 100 }} }} }},
    }}] }}],
  }},
  styles: {{
    default: {{ document: {{ run: {{ font: "{F_BODY}", size: 24, color: "000000" }} }} }},
    paragraphStyles: [
      {{
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: {{ size: 40, bold: true, font: "{F_HEAD}", color: "{H1_COLOR}" }},
        paragraph: {{ spacing: {{ before: 360, after: 80 }}, outlineLevel: 0 }},
      }},
      {{
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: {{ size: 28, bold: true, font: "{F_HEAD}", color: "{C_PRI}" }},
        paragraph: {{ spacing: {{ before: 220, after: 100 }}, outlineLevel: 1 }},
      }},
    ],
  }},
  sections: [{{
    properties: {{
      page: {{
        size: {{ width: 11906, height: 16838 }},
        margin: {{ top: 1440, right: 1080, bottom: 1440, left: 1440 }},
      }},
      {page_borders_block}
    }},
    {header_footer_block}
    children: [
{logo_left_block}{logo_right_block}
      new Paragraph({{
        children: [new TextRun({{ text: `{title}`, bold: true, size: 56,
          color: "{C_SEC}", font: "{F_HEAD}" }})],
        alignment: AlignmentType.CENTER,
        spacing: {{ before: 600, after: 200 }},
      }}),
      ...{cover_img_js},
{cover_meta_js}
      new Paragraph({{ children: [new PageBreak()] }}),

      new Paragraph({{ text: "", spacing: {{ before: 400 }} }}),
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_students}", bold: true, size: 40,
          font: "{F_HEAD}", color: "{C_PRI}" }})],
        alignment: AlignmentType.CENTER, spacing: {{ after: 400 }},
        border: {{ bottom: {{ style: BorderStyle.SINGLE, size: 4,
          color: "{C_PRI}", space: 2 }} }},
      }}),
      new Table({{
        width: {{ size: 9576, type: WidthType.DXA }},
        columnWidths: [4788, 4788],
        rows: (() => {{
          const rows = [];
          for (let i = 0; i < names.length; i += 2) {{
            const fill = (Math.floor(i/2) % 2 === 0) ? "{C_BGALT}" : "FFFFFF";
            rows.push(new TableRow({{ children: [
              new TableCell({{
                borders: cellBord, width: {{ size: 4788, type: WidthType.DXA }},
                margins: {{ top: 100, bottom: 100, left: 160, right: 160 }},
                shading: {{ type: ShadingType.CLEAR, color: "auto", fill: fill }},
                children: [new Paragraph({{
                  children: [new TextRun({{ text: names[i] || "", size: 24, font: "{F_BODY}" }})],
                  spacing: {{ line: 360, lineRule: "auto" }}, alignment: AlignmentType.BOTH,
                }})]
              }}),
              new TableCell({{
                borders: cellBord, width: {{ size: 4788, type: WidthType.DXA }},
                margins: {{ top: 100, bottom: 100, left: 160, right: 160 }},
                shading: {{ type: ShadingType.CLEAR, color: "auto", fill: fill }},
                children: [new Paragraph({{
                  children: [new TextRun({{ text: names[i+1] || "", size: 24, font: "{F_BODY}" }})],
                  spacing: {{ line: 360, lineRule: "auto" }}, alignment: AlignmentType.BOTH,
                }})]
              }}),
            ] }}));
          }}
          return rows;
        }})(),
      }}),
      new Paragraph({{ children: [new PageBreak()] }}),

{abstract_js}

      new Paragraph({{ text: "", spacing: {{ before: 400 }} }}),
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_objectives}", bold: true, size: 40,
          font: "{F_HEAD}", color: "{C_PRI}" }})],
        spacing: {{ after: 100 }},
        border: {{ bottom: {{ style: BorderStyle.SINGLE, size: 4,
          color: "{C_PRI}", space: 2 }} }},
        alignment: {align_heading},
      }}),
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_obj_intro}",
          size: 24, italics: true, color: "{C_GREY}", font: "{F_BODY}" }})],
        spacing: {{ after: 200 }},
        alignment: {align_text},
      }}),
{obj_js}
      new Paragraph({{ children: [new PageBreak()] }}),

      new Paragraph({{ text: "", spacing: {{ before: 400 }} }}),
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_toc}", bold: true, size: 40,
          font: "{F_HEAD}", color: "{C_PRI}" }})],
        spacing: {{ after: 280 }},
        border: {{ bottom: {{ style: BorderStyle.SINGLE, size: 4,
          color: "{C_PRI}", space: 2 }} }},
        alignment: {align_heading},
      }}),
{toc_js}

{section_blocks}

      new Paragraph({{ children: [new PageBreak()] }}),
      new Paragraph({{ text: "", spacing: {{ before: 400 }} }}),
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_references}", bold: true, size: 40,
          font: "{F_HEAD}", color: "{C_PRI}" }})],
        spacing: {{ after: 100 }},
        border: {{ bottom: {{ style: BorderStyle.SINGLE, size: 4,
          color: "{C_PRI}", space: 2 }} }},
        alignment: {align_heading},
      }}),
      new Paragraph({{
        children: [new TextRun({{ text: "{lbl_ref_edition}", size: 20, italics: true,
          color: "888888", font: "{F_BODY}" }})],
        spacing: {{ after: 240 }},
        alignment: {align_text},
      }}),
{ref_js}
    ],
  }}],
}});

Packer.toBuffer(doc)
  .then(buf => {{ fs.writeFileSync(outPath, buf); console.log("OK:" + outPath); }})
  .catch(err => {{ console.error("ERR:" + err.message); process.exit(1); }});
"""

    base_dir = _get_base_dir()
    tmp      = base_dir / "temp_docx_builder.js"
    tmp.write_text(js, encoding="utf-8")
    try:
        r = subprocess.run(
            ["node", str(tmp)], cwd=str(base_dir),
            capture_output=True, text=True, encoding="utf-8", timeout=180,
        )
        if "OK:" not in r.stdout:
            raise RuntimeError(r.stderr or r.stdout)
        print(f"[Assignment] ✅ DOCX created: {output_path.name}")
    finally:
        tmp.unlink(missing_ok=True)

    _apply_docx_template_styles(output_path, base_dir / "templates" / "temp_1.docx")