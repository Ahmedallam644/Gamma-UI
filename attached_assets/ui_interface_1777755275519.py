"""
engine/ui_interface.py
======================
Headless pipeline orchestrator for the FastAPI backend.

Changes from desktop version:
  - All tkinter / GUI code removed.
  - All os.startfile() / subprocess auto-open calls removed.
  - Output directory changed from Desktop to <project_root>/downloads/.
  - run_assignment_pipeline() returns a plain list[str] of generated file paths.
  - speak / player / GUI progress_cb hooks kept as no-ops for drop-in compatibility.
"""

import csv
import json
import shutil
import tempfile
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

from .config import WORDS_PER_PAGE   # noqa: F401  (keep config import alive)
from .ai_logic import (
    _safe_filename,
    _outline_dict_to_text,
    _parse_user_outline,
    _groq_generate_outline,
    _groq_generate_abstract,
    _groq_generate_content,
    _crossref_generate_references,
    _groq_generate_brochure_panels,
)
from .asset_manager import (
    _fetch_cover_image,
    _fetch_all_images,
    _enrich_with_stem_assets,
)
from .docx_builder import _build_docx
from .pptx_builder import _build_pptx


# ── Output directory ──────────────────────────────────────────────────────────
def _downloads_dir() -> Path:
    """Return <project_root>/downloads/, creating it if necessary."""
    d = Path(__file__).resolve().parent.parent / "downloads"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Session helpers (server-side session cache) ───────────────────────────────
def _session_dir() -> Path:
    d = Path(__file__).resolve().parent.parent / ".sessions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _session_path(topic: str) -> Path:
    safe = _safe_filename(topic)
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    return _session_dir() / f"session_{safe}_{ts}.json"


def _save_session(path: Path, data: dict) -> None:
    try:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        print(f"[Assignment] Session save warning: {exc}")


# ── Image resolution helper (NEW) ─────────────────────────────────────────────
import urllib.request

def _download_image_to_dir(url: str, dest_dir: Path, filename: str):
    """Downloads an image while pretending to be a normal Google Chrome browser."""
    if not url: 
        return None
    try:
        # The 'User-Agent' mask stops Pexels from blocking the download!
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
            
        out_path = dest_dir / filename
        out_path.write_bytes(data)
        return out_path
    except Exception as e:
        print(f"[Image Download] Failed for {url}: {e}")
        return None


def _apply_selected_images(
    enriched: dict,
    selected_images: dict,
    img_dir: Path,
    progress_cb=None,
) -> dict:
    """
    Overwrites auto-fetched images with the user's manual selections.
    Aggressively checks both sections and subheadings for a title match.
    """
    if not selected_images:
        return enriched

    sections: list[dict] = enriched.get("sections", [])
    total = len(selected_images)
    done  = 0

    import re

    for section in sections:
        # 1. Check the main Section Heading
        sec_title = section.get("heading", "").strip()
        url = selected_images.get(sec_title)
        if not url:
            stripped = re.sub(r"^[\d١٢٣٤٥٦٧٨٩٠]+[.\-\s)]+", "", sec_title).strip()
            url = selected_images.get(stripped)
            
        if url:
            done += 1
            if progress_cb:
                progress_cb(f"PROGRESS|images|{done}|{total}|تحميل الصورة: {sec_title[:30]}…")
            ext = url.split("?")[0].rsplit(".", 1)[-1].lower()
            if ext not in {"jpg", "jpeg", "png", "webp", "gif"}: ext = "jpg"
            local_path = _download_image_to_dir(url, img_dir, f"sel_{done}.{ext}")
            if local_path:
                section["image_path"] = str(local_path)
        
        # 2. Check all Subheadings inside the section
        for sub in section.get("subheadings", []):
            sub_title = sub.get("title", "").strip()
            url = selected_images.get(sub_title)
            if not url:
                stripped = re.sub(r"^[\d١٢٣٤٥٦٧٨٩٠]+[.\-\s)]+", "", sub_title).strip()
                url = selected_images.get(stripped)
                
            if url:
                done += 1
                if progress_cb:
                    progress_cb(f"PROGRESS|images|{done}|{total}|تحميل الصورة: {sub_title[:30]}…")
                ext = url.split("?")[0].rsplit(".", 1)[-1].lower()
                if ext not in {"jpg", "jpeg", "png", "webp", "gif"}: ext = "jpg"
                local_path = _download_image_to_dir(url, img_dir, f"sel_sub_{done}.{ext}")
                if local_path:
                    sub["image_path"] = str(local_path)

    return enriched


# ── Main Pipeline ─────────────────────────────────────────────────────────────
def run_assignment_pipeline(
    topic:               str,
    page_count:          int,
    names:               list,
    user_hints:          str  = "",
    output_fmt:          str  = "word",
    supervisor:          str  = "",
    university:          str  = "",
    department:          str  = "",
    course:              str  = "",
    language:            str  = "Arabic",
    theme:               str  = "medical",
    assignment_type:     str  = "essay",
    citation_style:      str  = "apa",
    include_abstract:    bool = False,
    export_pdf:          bool = False,
    logo_left_path:      str  = "",
    logo_right_path:     str  = "",
    custom_outline_text: str  = "",
    generate_brochure:   bool = False,
    selected_images: dict | None = None,
    # Kept for drop-in compatibility — ignored in headless mode
    speak=None,
    player=None,
    progress_cb=None,
    **kwargs,
) -> list[str]:
    """
    Run the full document-generation pipeline.

    Parameters
    ----------
    selected_images : dict[str, str] | None
        Optional mapping of ``{ subheading_title: image_url }`` chosen by the
        user in the frontend Image Picker step.  When provided, the pipeline
        skips DuckDuckGo for those sections and downloads the exact URLs the
        user selected instead.

    Returns
    -------
    list[str]
        Absolute paths of every file written inside downloads/.
    """

    session_file = _session_path(topic)
    session_data: dict = {
        "topic":     topic,
        "stage":     "outline",
        "completed": False,
        "timestamp": datetime.now().isoformat(),
    }

    def _p(msg: str) -> None:
        print(f"[Assignment] {msg}")
        if progress_cb:
            progress_cb(msg)

    # ── Step 1: Outline ───────────────────────────────────────────────────────
    if custom_outline_text.strip():
        _p("PROGRESS|outline|1|5|Using custom outline…")
        outline = _parse_user_outline(custom_outline_text, topic, page_count)
        _p(f"PROGRESS|outline|5|5|Custom outline: {len(outline['sections'])} sections")
    else:
        _p("PROGRESS|outline|1|5|Generating outline…")
        outline = _groq_generate_outline(
            topic, page_count, user_hints,
            language=language,
            assignment_type=assignment_type,
            progress_cb=progress_cb,
        )
        _p(f"PROGRESS|outline|5|5|Outline ready: {len(outline['sections'])} sections")

    session_data["outline"] = outline
    session_data["stage"]   = "content"
    _save_session(session_file, session_data)

    # ── Step 1b: Abstract (optional) ──────────────────────────────────────────
    abstract_data = None
    if include_abstract or assignment_type == "research":
        _p("PROGRESS|abstract|1|1|Generating abstract and keywords…")
        abstract_data = _groq_generate_abstract(outline, language=language)
        session_data["abstract"] = abstract_data

    # ── Step 2: Content ───────────────────────────────────────────────────────
    _p("PROGRESS|content|1|1|Writing content…")
    enriched = _groq_generate_content(
        outline, page_count,
        language=language,
        progress_cb=progress_cb,
        assignment_type=assignment_type,
    )
    _p("PROGRESS|content|1|1|Content ready")

    session_data["enriched"] = enriched
    session_data["stage"]    = "references"
    _save_session(session_file, session_data)

    # ── Step 3: References ────────────────────────────────────────────────────
    _p("PROGRESS|references|1|1|Fetching references…")
    references = _crossref_generate_references(
        topic, enriched,
        citation_style=citation_style,
        language=language,
    )
    _p(f"PROGRESS|references|1|1|{len(references)} references ready")

    session_data["references"] = references
    session_data["stage"]      = "images"
    _save_session(session_file, session_data)

    img_dir = Path(tempfile.mkdtemp(prefix="assign_imgs_"))
    created: list[str] = []

    try:
        # ── Step 4: Images & Assets ───────────────────────────────────────────
        _p("PROGRESS|images|1|3|Fetching cover image…")
        cover_image_path = _fetch_cover_image(topic, img_dir)

        _p("PROGRESS|images|2|3|Fetching section images…")

        if selected_images:
            # ----------------------------------------------------------------
            # User picked images in the frontend Image Picker step.
            #
            # Strategy:
            #   1. Run the normal auto-fetch so every section gets *some* image
            #      (this also fills in any sections the user skipped).
            #   2. Overwrite the auto-fetched paths for sections where the user
            #      made an explicit choice.
            #
            # This two-step approach means _fetch_all_images() still handles
            # sections the user left blank, while user choices always win.
            # ----------------------------------------------------------------
            enriched = _fetch_all_images(enriched, img_dir, progress_cb=progress_cb)
            _p(f"PROGRESS|images|2|3|Applying {len(selected_images)} user-selected image(s)…")
            enriched = _apply_selected_images(
                enriched, selected_images, img_dir, progress_cb=progress_cb
            )
        else:
            # No user selections — original behaviour unchanged.
            enriched = _fetch_all_images(enriched, img_dir, progress_cb=progress_cb)

        _p("PROGRESS|images|3|3|Generating charts and equations…")
        enriched = _enrich_with_stem_assets(enriched, topic, img_dir)
        _p("PROGRESS|images|3|3|Images and assets ready")

        # ── Step 5: Build Documents ───────────────────────────────────────────
        out_dir = _downloads_dir()
        safe    = _safe_filename(topic)
        ts      = datetime.now().strftime("%Y%m%d_%H%M%S")

        if output_fmt in ("word", "both"):
            _p("PROGRESS|build|1|2|Building Word document…")
            p = out_dir / f"Assignment_{safe}_{ts}.docx"
            _build_docx(
                enriched, names, references, p, topic,
                supervisor, university, department, course,
                language=language,
                citation_style=citation_style,
                include_abstract=include_abstract,
                abstract_data=abstract_data,
                cover_image_path=cover_image_path,
                logo_left_path=logo_left_path,
                logo_right_path=logo_right_path,
            )
            created.append(str(p))
            _p(f"PROGRESS|build|1|2|Word: {p.name}")

            if export_pdf:
                _p("PROGRESS|build|1|2|Exporting PDF…")
                pdf = _export_pdf(p)
                if pdf:
                    created.append(str(pdf))

        if output_fmt in ("pptx", "both"):
            _p("PROGRESS|build|2|2|Building PowerPoint…")
            p = out_dir / f"Assignment_{safe}_{ts}.pptx"
            _build_pptx(enriched, names, references, p, topic, supervisor, university, language=language, theme=theme)
            created.append(str(p))
            _p(f"PROGRESS|build|2|2|PPTX: {p.name}")

        # ── Step 6: Brochure (optional) ───────────────────────────────────────
        if generate_brochure:
            _p("PROGRESS|brochure|1|2|Generating brochure content…")
            panels = _groq_generate_brochure_panels(
                topic, language=language, progress_cb=progress_cb
            )

            # Apply user-selected images to brochure panels
            if selected_images:
                # Frontend sends keys matching BROCHURE_PANEL_TITLES:
                # "اللوحة الأولى" → panel[1], "اللوحة الثانية" → panel[2], etc.
                PANEL_KEY_MAP = {
                    "اللوحة الأولى":   1,
                    "اللوحة الثانية":  2,
                    "اللوحة الثالثة":  3,
                    "اللوحة الرابعة":  4,
                    "اللوحة الخامسة":  5,
                }
                for key, panel_idx in PANEL_KEY_MAP.items():
                    url = selected_images.get(key)
                    if url and panel_idx < len(panels):
                        local = _download_image_to_dir(url, img_dir, f"brochure_sel_{panel_idx}.jpg")
                        if local:
                            panels[panel_idx]["image_path"] = str(local)

            _p("PROGRESS|brochure|2|2|Building brochure file…")
            p_brochure = out_dir / f"Brochure_{safe}_{ts}.docx"
            _build_docx(
                enriched={},
                names=names,
                references=[],
                output_path=p_brochure,
                topic=topic,
                supervisor=supervisor,
                university=university,
                department=department,
                course=course,
                language=language,
                is_brochure=True,
                brochure_panels=panels,
            )
            created.append(str(p_brochure))
            _p(f"PROGRESS|brochure|2|2|Brochure: {p_brochure.name}")

        session_data["completed"]    = True
        session_data["output_paths"] = created
        _save_session(session_file, session_data)

        return created

    finally:
        shutil.rmtree(img_dir, ignore_errors=True)


# ── Optional: PDF export via LibreOffice (headless) ──────────────────────────
def _export_pdf(docx_path: Path) -> "Path | None":
    import subprocess
    pdf_path = docx_path.with_suffix(".pdf")
    try:
        subprocess.run(
            [
                "soffice", "--headless", "--convert-to", "pdf",
                "--outdir", str(docx_path.parent), str(docx_path),
            ],
            capture_output=True, text=True, timeout=120,
        )
        if pdf_path.exists():
            print(f"[Assignment] ✅ PDF created: {pdf_path.name}")
            return pdf_path
    except FileNotFoundError:
        print("[Assignment] LibreOffice not found — skipping PDF export.")
    except Exception as exc:
        print(f"[Assignment] PDF export failed: {exc}")
    return None


# ── Batch Pipeline ────────────────────────────────────────────────────────────
def run_batch_pipeline(
    csv_path:         Path,
    output_dir:       "Path | None" = None,
    supervisor:       str  = "",
    university:       str  = "",
    department:       str  = "",
    course:           str  = "",
    language:         str  = "Arabic",
    assignment_type:  str  = "essay",
    citation_style:   str  = "apa",
    include_abstract: bool = False,
    export_pdf:       bool = False,
    output_fmt:       str  = "word",
    progress_cb=None,
    **kwargs,
) -> Path:
    if output_dir is None:
        output_dir = _downloads_dir() / "Batch_Assignments"
    output_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rows.append(row)

    total     = len(rows)
    all_paths: list[str] = []

    for i, row in enumerate(rows):
        topic = row.get("topic", "").strip()
        if not topic:
            continue
        names = [n.strip() for n in row.get("names", "").split(",") if n.strip()]
        pages = int(row.get("pages", "5").strip() or "5")

        if progress_cb:
            progress_cb(f"PROGRESS|batch|{i+1}|{total}|Batch: {topic[:30]}…")

        try:
            paths = run_assignment_pipeline(
                topic=topic, page_count=pages, names=names,
                user_hints=row.get("hints", ""),
                output_fmt=output_fmt,
                supervisor=supervisor  or row.get("supervisor",  ""),
                university=university  or row.get("university",  ""),
                department=department  or row.get("department",  ""),
                course=course          or row.get("course",      ""),
                language=language,
                assignment_type=assignment_type,
                citation_style=citation_style,
                include_abstract=include_abstract,
                export_pdf=export_pdf,
                progress_cb=progress_cb,
                # Batch jobs don't have user-selected images
                selected_images=None,
            )
            for p in paths:
                dest = output_dir / Path(p).name
                shutil.copy2(p, dest)
                all_paths.append(str(dest))
        except Exception as exc:
            print(f"[Assignment] Batch item failed '{topic}': {exc}")

    zip_path = output_dir / f"Batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in all_paths:
            zf.write(p, arcname=Path(p).name)
    return zip_path


# ── Legacy entry-point stub (no-op in headless mode) ─────────────────────────
def assignment_maker(
    parameters=None, response=None, player=None,
    session_memory=None, speak=None,
) -> str:
    """
    Thin wrapper kept for backward compatibility.
    In headless mode the FastAPI router calls run_assignment_pipeline() directly.
    """
    params = parameters or {}
    topic  = params.get("topic", "").strip()
    if not topic:
        return "Error: 'topic' parameter is required."

    page_count = int(params.get("pages", params.get("page_count", 5)))
    raw_names  = params.get("names", [])
    names = (
        [n.strip() for n in raw_names.split(",") if n.strip()]
        if isinstance(raw_names, str)
        else [str(n).strip() for n in raw_names if str(n).strip()]
    )
    try:
        paths = run_assignment_pipeline(
            topic=topic,
            page_count=page_count,
            names=names,
            user_hints=params.get("hints", ""),
            output_fmt=params.get("format", "word"),
            supervisor=params.get("supervisor", ""),
            university=params.get("university", ""),
            department=params.get("department", ""),
            course=params.get("course", ""),
            language=params.get("language", "Arabic"),
            assignment_type=params.get("assignment_type", "essay"),
            citation_style=params.get("citation_style", "apa"),
            include_abstract=params.get("include_abstract", False),
            export_pdf=params.get("export_pdf", False),
            custom_outline_text=params.get("custom_outline", ""),
            generate_brochure=params.get("generate_brochure", False),
            # Legacy callers don't have selected_images
            selected_images=None,
        )
        names_str = ", ".join(Path(p).name for p in paths)
        return f"Done. Files saved to downloads/: {names_str}"
    except Exception as exc:
        return f"Pipeline failed: {exc}"


# ── Compatibility shim ────────────────────────────────────────────────────────
def _show_assignment_dialog(*args, **kwargs) -> None:
    """No-op — GUI dialogs are not available in headless/API mode."""
    print("[Assignment] _show_assignment_dialog() called in headless mode — ignored.")