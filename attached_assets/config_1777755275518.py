"""
actions/assignment_engine/config.py
====================================
All constants, UI colours, document templates, system prompts,
type guides, and academic perspectives for the Academic & Design Engine.
"""

# ── UI Colour Palette (Tkinter dialog) ──────────────────────────────────────
C_BG    = "#0d0d1a"
C_PANEL = "#12122a"
C_PRI   = "#e94560"
C_ACC2  = "#533483"
C_DIM   = "#1e1e40"
C_TEXT  = "#d0d0e8"
C_LABEL = "#e94560"
C_SMALL = "#8888aa"
C_GREEN = "#39ff14"

# ── Document Generation Constants ───────────────────────────────────────────
WORDS_PER_PAGE    = 380
SECTIONS_PER_PAGE = 0.6

# ── Default Academic Document Template (Atherosclerosis Style) ──────────────
DEFAULT_TEMPLATE = {
    "name": "Atherosclerosis Academic",
    "primary_color": "0F4761",
    "secondary_color": "C00000",
    "accent_color": "156082",
    "grey_color": "595959",
    "light_grey": "BFBFBF",
    "bg_alt": "F2F2F2",
    "font_heading": "Arial",
    "font_body": "Times New Roman",
    "cover_layout": "standard",
    "rtl": False,
    "page_border_color": "0F4761",
    "page_border_size": 8,
}

# ── Brochure / Trifold Design Template ──────────────────────────────────────
BROCHURE_TEMPLATE = {
    "name": "Medical Trifold",
    "primary_color": "0F4761",      # Deep navy — main brand
    "secondary_color": "C00000",    # Rich red — headings, emphasis
    "accent_color": "156082",       # Steel blue — subheadings
    "highlight_color": "E8B923",    # Gold — accents, borders
    "panel_bg_1": "F8FAFC",         # Very light blue-white
    "panel_bg_2": "EBF3FB",         # Light blue tint
    "panel_bg_3": "FFFFFF",         # Pure white
    "panel_bg_dark": "0F4761",      # Dark navy for cover panel
    "font_heading": "Arial",
    "font_body": "Times New Roman",
    "cover_layout": "trifold_landscape",
    "rtl": False,
    "page_border_color": "0F4761",
    "page_border_size": 0,
}

# ── Universal Academic Tone ──────────────────────────────────────────────────
_UNIVERSAL_TONE = (
    "Use a highly formal, rigorous academic tone with sophisticated vocabulary, "
    "critical evaluation, and logical synthesis."
)

# ── Citation Style Registry ──────────────────────────────────────────────────
_CITATION_STYLES = {"apa", "ieee", "harvard", "vancouver"}

# ── Assignment Type Guide (Single Professional Mode) ─────────────────────────
_TYPE_GUIDE = {
    "academic_research": (
        "Produce a comprehensive academic research document: "
        "Introduction → Literature Review → Thematic Body Sections → Critical Analysis → "
        "Conclusion. Dense, evidence-based prose with rigorous citations."
    ),
}

# ── Randomised Academic Perspectives ─────────────────────────────────────────
_ACADEMIC_PERSPECTIVES = [
    "Emphasise recent quantitative data, epidemiological statistics, and evidence-based findings from peer-reviewed sources published within the last five years.",
    "Take a historical and evolutionary perspective, tracing how scientific understanding of this topic has developed and changed over time, comparing past theories with current knowledge.",
    "Focus on socioeconomic determinants, health equity considerations, ethical implications, and community-level population impacts.",
    "Provide a rigorous analytical breakdown that critically evaluates competing theoretical frameworks, weighing their explanatory power and practical utility.",
    "Explore interdisciplinary connections, synthesising insights from at least two distinct academic or clinical fields to produce a more holistic understanding.",
    "Centre practical clinical and professional applications, implementation challenges in real healthcare or research settings, and lessons from documented case outcomes.",
]

# ── Content Generation System Prompt ─────────────────────────────────────────
_CONTENT_SYSTEM_PROMPT = (
    "You are an expert academic writer producing content for a formal published assignment. "
    "Use a highly formal, rigorous academic tone with sophisticated vocabulary, critical evaluation, and logical synthesis. "
    "Your writing must strictly follow these rules:\n"
    "1. Write ONLY in flowing, formal academic prose — no bullet points, no numbered lists, "
    "   no headers, no markdown formatting whatsoever.\n"
    "2. ABSOLUTELY NO lists, NO bullet points, NO checkboxes (☐, ☑, ✓), NO tables, NO markdown. "
    "   Only cohesive, flowing academic paragraphs.\n"
    "3. Every paragraph must begin with a clear topic sentence, followed by elaboration, "
    "   supporting evidence or examples, and a linking sentence to the next idea.\n"
    "4. Use precise, field-specific academic vocabulary appropriate to advanced scholarly publication.\n"
    "5. Integrate factual content naturally: mechanisms, statistics, clinical findings, "
    "   theoretical frameworks — woven into the prose, not listed.\n"
    "6. Maintain a single consistent analytical voice throughout.\n"
    "7. Do NOT start with phrases like 'In this section', 'This paragraph', or 'As mentioned'.\n"
    "8. Do NOT include subheading titles in the output — write ONLY the paragraph content.\n"
    "9. Write entirely in the language specified. Do not mix languages.\n"
    "10. If the requested language is Arabic, you MUST act as a native Arabic professor. "
    "    ALL output MUST be 100% Arabic. NO English words whatsoever — translate every scientific, "
    "    technical, and general term into Arabic. Do not use Latin script at all.\n"
    "11. Vary your sentence structure dramatically. Use short punchy sentences alongside complex "
    "    multi-clause sentences. Avoid starting consecutive sentences with the same word. "
    "    Write with the slight unpredictability of a human professor, not the mechanical uniformity of a language model.\n"
)

# ── Pre/Post Test MCQ System Prompt ──────────────────────────────────────────
_PREPOST_SYSTEM_PROMPT = (
    "You are an expert medical educator designing a Pre/Post Test assessment. "
    "Generate exactly 10 multiple-choice questions (MCQs) that test core knowledge of the topic.\n"
    "Rules:\n"
    "1. Each question must have exactly 4 options labeled A, B, C, D.\n"
    "2. The questions must cover the FULL breadth of the topic — from basic concepts to advanced clinical applications.\n"
    "3. Wrap the COMPLETE correct answer text in [[CORRECT]]...[[/CORRECT]].\n"
    "   Example: A) [[CORRECT]]Paris[[/CORRECT]]  B) London  C) Berlin  D) Madrid\n"
    "4. Write in formal academic language appropriate for university-level medical/nursing students.\n"
    "5. Include a mix of: knowledge recall (30%), clinical application (40%), and analytical reasoning (30%).\n"
    "6. If the language is Arabic, ALL output MUST be 100% Arabic. NO English words whatsoever.\n"
    "7. Return ONLY the questions and answers as flowing text paragraphs. NO markdown, NO tables, NO bullet points.\n"
    "8. Number each question clearly: Q1, Q2, Q3...\n"
)

# ── Brochure Content System Prompt ───────────────────────────────────────────
_BROCHURE_CONTENT_SYSTEM = (
    "You are an expert academic writer producing concise trifold-brochure content. "
    "Each passage must be brief (60-90 words), punchy, and highly readable. "
    "Use formal but accessible language. No markdown, no bullet points, flowing prose only. "
    "If the language is Arabic, ALL output must be 100% Arabic — no English words whatsoever."
)