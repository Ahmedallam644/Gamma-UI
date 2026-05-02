import os
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import MSO_AUTO_SIZE  # <--- CRITICAL: Required for Auto-Shrink
import re

def _strip_tags(text):
    """Clean up AI and MCQ highlight tags."""
    return re.sub(r'\[\[CORRECT\]\](.*?)\[\[/CORRECT\]\]', r'\1', str(text))

def _build_pptx(enriched, names, references, output_path, topic, supervisor, university, language="Arabic", theme="medical", **kwargs):
    # Map the theme to your specific files 
    template_files = {
        "medical": "template_medical.pptx",
        "modern":  "template_modern.pptx",
        "classic": "template_classic.pptx",
        "dark":    "template_dark.pptx"
    }
    
    filename = template_files.get(theme, "template_medical.pptx")
    template_path = Path(__file__).parent / "templates" / filename

    try:
        prs = Presentation(template_path)
        # Wipe dummy slides/watermarks from the original template
        for i in range(len(prs.slides) - 1, -1, -1):
            rId = prs.slides._sldIdLst[i].rId
            prs.part.drop_rel(rId)
            del prs.slides._sldIdLst[i]
    except Exception:
        prs = Presentation()

    # Title Slide (Layout 0)
    title_layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(title_layout)
    if slide.shapes.title:
        slide.shapes.title.text = _strip_tags(topic)
    if len(slide.placeholders) > 1:
        slide.placeholders[1].text = f"{university}\n{' | '.join(names)}"

    # Content Slides (Layout 1)
    content_layout = prs.slide_layouts[1] if len(prs.slide_layouts) > 1 else prs.slide_layouts[0]

    for section in enriched.get("sections", []):
        slide = prs.slides.add_slide(content_layout)
        if slide.shapes.title:
            slide.shapes.title.text = _strip_tags(section["heading"])
            
        body_shape = next((s for s in slide.placeholders if s.placeholder_format.idx == 1), None)
        
        # Check if this slide will have an image
        img_path = section.get("image_path") or next((sub.get("image_path") for sub in section.get("subheadings", []) if sub.get("image_path")), "")
        has_img = bool(img_path and Path(img_path).exists())

        if body_shape:
            # 🚀 FIX 1: Physically shrink the text box so it doesn't overlap the image!
            if has_img:
                body_shape.width = Inches(5.8)  # Stop text halfway across the screen
            else:
                body_shape.width = Inches(9.0)  # Use full width if no image

            if body_shape.has_text_frame:
                tf = body_shape.text_frame
                tf.clear()
                tf.word_wrap = True 
                # 🚀 FIX 2: Force the text to shrink if it gets too tall
                tf.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
                
                for sub in section.get("subheadings", []):
                    # Main Point (Bold)
                    p = tf.add_paragraph()
                    p.text = "• " + _strip_tags(sub["title"])
                    p.font.bold = True
                    p.font.size = Pt(18)
                    
                    # Gamma Style: Short Sub-points
                    content = _strip_tags(sub.get("content", ""))
                    sentences = [s.strip() for s in content.split('.') if len(s.strip()) > 15]
                    
                    for sent in sentences[:2]: # Limit to 2 points
                        # 🚀 FIX 3: Cap the sentence length to force visual conciseness
                        safe_sent = sent[:150] + "..." if len(sent) > 150 else sent
                        sp = tf.add_paragraph()
                        sp.text = safe_sent + "."
                        sp.level = 1
                        sp.font.size = Pt(14)

        # 4. Image Placement
        if has_img:
            try:
                # Placed perfectly in the empty space we created
                slide.shapes.add_picture(img_path, Inches(6.2), Inches(1.5), width=Inches(3.5))
            except Exception as e: 
                print(f"[PPTX] Error adding image: {e}")

    prs.save(output_path)