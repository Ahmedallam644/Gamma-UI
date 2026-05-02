"""
engine/asset_manager.py
========================
External asset gathering for the headless FastAPI backend.

Changes from desktop version:
  - All tkinter / CAPTCHA popup code removed.
  - Selenium human-in-the-loop image picker removed; replaced with
    fully-automated lightweight image fetch (Unsplash Source + DuckDuckGo
    image API — no browser required, no user interaction).
  - _wait_for_captcha_solved() becomes a no-op that always returns False,
    so Selenium-based paths skip cleanly when Selenium is not available.
  - _selenium_driver() still supported as an optional upgrade path, but
    the human-click overlay JS is gone.
  - All other helpers (_render_equation_image, _generate_chart_image,
    _enrich_with_stem_assets) are unchanged.
"""

import os
import re
import time
import random
import urllib.request
import urllib.parse
from pathlib import Path

# ── Optional matplotlib ──────────────────────────────────────────────────────
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    _HAS_MPL = True
except Exception:
    _HAS_MPL = False


# ── Image Query Builder ───────────────────────────────────────────────────────
def _precise_query(sub_title: str, topic: str) -> str:
    stop = {
        "overview", "introduction", "background", "summary", "conclusion",
        "definition", "history", "types", "general", "basics", "aspects",
        "مقدمة", "خاتمة", "نظرة عامة", "مقدمه", "خاتمه", "تعريف",
        "تاريخ", "أنواع", "نوع", "عام", "أساسيات", "جوانب", "ملخص",
        "نتائج", "أهداف", "أهمية", "خصائص", "مميزات", "عناصر",
        "مكونات", "مدخل", "إطار", "مفاهيم", "مفهوم", "نظريات",
        "نظرية", "دراسات", "دراسة", "آليات", "آلية", "أسباب",
        "سبب", "عوامل", "عامل", "تشخيص", "علاج", "وقاية",
        "تحليل", "تقييم", "مناقشة", "توصيات", "توصية",
    }
    sub_clean = " ".join(w for w in sub_title.split() if w.lower() not in stop).strip() or sub_title
    topic_kw  = " ".join(topic.split()[:3])
    return f"{sub_clean} {topic_kw}".strip()


# ── Image Validation & Download ───────────────────────────────────────────────
def _is_content_image(w_str, h_str, src: str) -> bool:
    if not src:
        return False
    if any(x in src.lower() for x in ("logo", "favicon", "icon", "banner", "ad_", "sprite")):
        return False
    w = int(w_str) if w_str and str(w_str).isdigit() else 0
    h = int(h_str) if h_str and str(h_str).isdigit() else 0
    if w > 0 and w < 300:
        return False
    if h > 0 and h < 200:
        return False
    return True


def _download_image(url: str, dest: Path) -> bool:
    """Download an image URL to dest.  Returns True on success."""
    try:
        if url.startswith("data:image"):
            import base64 as _b64
            _, encoded = url.split(",", 1)
            encoded += "=" * ((4 - len(encoded) % 4) % 4)
            dest.write_bytes(_b64.b64decode(encoded))
        else:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; AcademicBot/1.0)"},
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                dest.write_bytes(resp.read())
        return dest.exists() and dest.stat().st_size > 300
    except Exception as exc:
        print(f"[Assignment] Image download failed ({url[:60]}…): {exc}")
        return False


# ── Automated Image Search (no browser required) ─────────────────────────────
def _duckduckgo_image_url(query: str) -> "str | None":
    """
    Fetch one image URL from DuckDuckGo's image-search JSON endpoint.
    Falls back to None if the network call fails.
    """
    try:
        safe_q = urllib.parse.quote(query)
        # Step 1: get a vqd token
        token_url = f"https://duckduckgo.com/?q={safe_q}&iax=images&ia=images"
        req = urllib.request.Request(
            token_url,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode("utf-8", errors="ignore")
        m = re.search(r'vqd=([\d-]+)', html)
        if not m:
            return None
        vqd = m.group(1)

        # Step 2: fetch image results JSON
        api_url = (
            f"https://duckduckgo.com/i.js?l=us-en&o=json&q={safe_q}"
            f"&vqd={vqd}&f=,,,,,&p=1"
        )
        req2 = urllib.request.Request(api_url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer":    "https://duckduckgo.com/",
        })
        with urllib.request.urlopen(req2, timeout=10) as r2:
            import json
            data = json.loads(r2.read().decode("utf-8", errors="ignore"))
        results = data.get("results", [])
        if results:
            return results[0].get("image") or results[0].get("thumbnail")
    except Exception as exc:
        print(f"[Assignment] DuckDuckGo image search failed: {exc}")
    return None


def _unsplash_image_url(query: str) -> "str | None":
    """
    Return a free Unsplash Source URL (redirects to an actual image).
    This is a reliable fallback that works without an API key.
    """
    try:
        safe_q = urllib.parse.quote(query.split()[:4].__str__().strip("[]'\"").replace(",", ""))
        # Unsplash Source: /photos/random?query=…  (200×200 thumbnail, enough for documents)
        url = f"https://source.unsplash.com/featured/800x600?{safe_q}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        # Follow redirect to get the final image URL
        with urllib.request.urlopen(req, timeout=12) as r:
            final_url = r.geturl()
        if final_url and not final_url.endswith("unsplash.com/"):
            return final_url
    except Exception as exc:
        print(f"[Assignment] Unsplash fallback failed: {exc}")
    return None


def _fetch_image_url(query: str) -> "str | None":
    """Try DuckDuckGo first, then Unsplash."""
    url = _duckduckgo_image_url(query)
    if url:
        return url
    return _unsplash_image_url(query)


# ── Cover Image ───────────────────────────────────────────────────────────────
def _fetch_cover_image(topic: str, img_dir: Path) -> str:
    """Fetch a landscape cover image for the document cover page."""
    query = f"{topic} overview illustration landscape"
    url   = _fetch_image_url(query)
    if url:
        dest = img_dir / "cover.jpg"
        if _download_image(url, dest):
            print("[Assignment] Cover image fetched")
            return str(dest)
    print("[Assignment] Cover image not available — continuing without it")
    return ""


# ── Per-section Image Gathering ───────────────────────────────────────────────
def _fetch_all_images(
    enriched: dict,
    img_dir: Path,
    progress_cb=None,
    player=None,       # kept for signature compatibility — unused in headless mode
    **kwargs,
) -> dict:
    """Download one relevant image per subheading, fully automated."""
    topic      = enriched.get("title", "")
    global_idx = 0

    for section in enriched.get("sections", []):
        for sub in section.get("subheadings", []):
            query = _precise_query(sub["title"], topic)
            if progress_cb:
                progress_cb(f"PROGRESS|images|{global_idx}|999|Image: {sub['title'][:50]}…")
            try:
                url = _fetch_image_url(query)
                if url:
                    dest = img_dir / f"img_{global_idx:03d}.jpg"
                    if _download_image(url, dest):
                        sub["image_path"] = str(dest)
                        print(f"[Assignment] img_{global_idx:03d}: {sub['title'][:40]}")
                    else:
                        dest.unlink(missing_ok=True)
            except Exception as exc:
                print(f"[Assignment] Image '{query[:40]}': {exc}")
            global_idx += 1
            # Polite rate-limit: one request every ~0.5 s
            time.sleep(0.5)

    return enriched


# ── CAPTCHA stub (headless — always returns False / skips) ────────────────────
def _is_captcha_page(driver) -> bool:  # noqa: ANN001
    try:
        source = driver.page_source.lower()
        title  = driver.title.lower()
        return any(
            s in source or s in title
            for s in ("captcha", "recaptcha", "unusual traffic", "cloudflare")
        )
    except Exception:
        return False


def _wait_for_captcha_solved(driver, progress_cb=None, player=None, **kwargs) -> bool:  # noqa: ANN001
    """
    In headless / API mode there is no human to solve a CAPTCHA.
    Return False immediately so the caller skips this image.
    """
    print("[Assignment] CAPTCHA detected — skipping image (headless mode).")
    if progress_cb:
        progress_cb("CAPTCHA detected — image skipped (headless mode).")
    return False


# ── Optional Selenium driver (upgrade path, not required) ────────────────────
def _selenium_driver():  # noqa: ANN201
    """
    Return a headless Chrome WebDriver if Selenium + ChromeDriver are
    available, otherwise return None.  The driver is used only as an
    optional upgrade path; the automated fetch functions above are the
    default.
    """
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
        from webdriver_manager.chrome import ChromeDriverManager
    except ImportError:
        return None

    options = Options()
    options.add_argument("--headless=new")          # fully headless
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--window-size=1280,800")
    try:
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=options)
    except Exception as exc:
        print(f"[Assignment] Chrome WebDriver unavailable: {exc}")
        return None


# ── STEM: Equation Rendering ─────────────────────────────────────────────────
def _render_equation_image(latex: str, dest: Path, dpi: int = 150) -> bool:
    if not _HAS_MPL:
        return False
    try:
        fig = plt.figure(figsize=(0.01, 0.01))
        fig.text(0.5, 0.5, f"${latex}$", fontsize=14, ha="center", va="center")
        fig.savefig(str(dest), dpi=dpi, bbox_inches="tight", pad_inches=0.05, transparent=True)
        plt.close(fig)
        return dest.exists() and dest.stat().st_size > 500
    except Exception as exc:
        print(f"[Assignment] Equation render failed: {exc}")
        return False


# ── STEM: Chart Generation ────────────────────────────────────────────────────
def _generate_chart_image(topic: str, sub_title: str, img_dir: Path) -> "Path | None":
    if not _HAS_MPL:
        return None
    data_keywords = [
        "prevalence", "rate", "percentage", "statistics", "data", "trend",
        "نسبة", "معدل", "إحصاء", "بيانات", "انتشار", "اتجاه",
    ]
    combined = f"{topic} {sub_title}".lower()
    if not any(k in combined for k in data_keywords):
        return None
    try:
        fig, ax = plt.subplots(figsize=(6, 3.5))
        categories = ["2019", "2020", "2021", "2022", "2023"]
        values     = [random.randint(20, 45) + i * random.randint(2, 8) for i in range(5)]
        ax.bar(categories, values, color="#0F4761")
        ax.set_title(sub_title, fontsize=12)
        ax.set_ylabel("Value")
        dest = img_dir / f"chart_{random.randint(1000, 9999)}.png"
        fig.savefig(str(dest), dpi=150, bbox_inches="tight")
        plt.close(fig)
        return dest
    except Exception as exc:
        print(f"[Assignment] Chart generation failed: {exc}")
        return None


# ── STEM Asset Enrichment ─────────────────────────────────────────────────────
def _enrich_with_stem_assets(enriched: dict, topic: str, img_dir: Path) -> dict:
    for section in enriched.get("sections", []):
        for sub in section.get("subheadings", []):
            chart_path = _generate_chart_image(topic, sub["title"], img_dir)
            if chart_path:
                sub["chart_path"] = str(chart_path)
            latex_matches = re.findall(r'\$\$(.+?)\$\$', sub.get("content", ""))
            if latex_matches:
                eq_paths: list[str] = []
                for i, eq in enumerate(latex_matches[:3]):
                    eq_dest = img_dir / f"eq_{random.randint(1000, 9999)}_{i}.png"
                    if _render_equation_image(eq, eq_dest):
                        eq_paths.append(str(eq_dest))
                if eq_paths:
                    sub["equation_paths"] = eq_paths
    return enriched