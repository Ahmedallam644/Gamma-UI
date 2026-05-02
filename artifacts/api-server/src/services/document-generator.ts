import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  ImageRun, Header, Footer, PageNumber, SectionType, WidthType,
  TableCell, TableRow, Table, ShadingType, convertInchesToTwip,
  BorderStyle, TableLayoutType,
} from "docx";
import crypto from "crypto";

const TEMPLATE_COLORS: Record<string, { primary: string; light: string; dark: string }> = {
  word_1:  { primary: "2563EB", light: "EFF6FF", dark: "1E40AF" },
  word_2:  { primary: "4F46E5", light: "EEF2FF", dark: "3730A3" },
  classic: { primary: "0284C7", light: "E0F2FE", dark: "0369A1" },
  dark:    { primary: "334155", light: "F1F5F9", dark: "1E293B" },
  medical: { primary: "059669", light: "ECFDF5", dark: "047857" },
  modern:  { primary: "7C3AED", light: "F5F3FF", dark: "6D28D9" },
  default: { primary: "2563EB", light: "EFF6FF", dark: "1E40AF" },
};

interface Section { heading: string | null; paragraphs: string[] }

function parseContent(content: string, isArabic: boolean): Section[] {
  const ARABIC_HEADS = /^(الفصل|المقدمة|الخاتمة|التوصيات|الأهداف|الإطار|المراجع|ملخص|الأساليب|الطرق|النتائج|المناقشة|أهمية|خلفية)/i;
  const ENGLISH_HEADS = /^(Chapter|Introduction|Conclusion|Recommendations|Objectives|Framework|References|Summary|Abstract|Methods|Results|Discussion|Importance|Background)/i;
  const MD_HEAD = /^#{1,3}\s+/;

  const lines = content.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const sections: Section[] = [];
  let current: Section = { heading: null, paragraphs: [] };

  for (const line of lines) {
    const clean = line.replace(/^\*+|\*+$/g, "").replace(/^#+\s*/, "").trim();
    const isHead = (MD_HEAD.test(line) || (isArabic ? ARABIC_HEADS.test(clean) : ENGLISH_HEADS.test(clean))) && clean.length < 120;

    if (isHead) {
      if (current.heading !== null || current.paragraphs.length > 0) sections.push(current);
      current = { heading: clean, paragraphs: [] };
    } else if (clean.length > 0) {
      current.paragraphs.push(clean);
    }
  }
  if (current.heading !== null || current.paragraphs.length > 0) sections.push(current);
  return sections;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch { return null; }
}

async function uploadToCloudinary(
  buffer: Buffer, mimeType: string, filename: string,
  cloudName: string, apiKey: string, apiSecret: string
): Promise<string> {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = "nursing-documents";
  const stringToSign = `folder=${folder}&public_id=${filename}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(stringToSign).digest("hex");

  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), filename);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);
  formData.append("public_id", filename);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
    method: "POST", body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary raw upload failed: ${text}`);
  }
  const data = await res.json() as { secure_url: string };
  return data.secure_url;
}

export interface DocGenOptions {
  topic: string;
  studentNames: string[];
  supervisorName: string;
  department: string;
  language: string;
  documentType: string;
  templateName: string;
  pageCount: number;
  generatedContent: string;
  selectedImages: string[];
  universityLogoUrl?: string | null;
  facultyLogoUrl?: string | null;
  projectId: string;
}

export async function generateAndUploadDocument(
  opts: DocGenOptions,
  env: { cloudName: string; apiKey: string; apiSecret: string }
): Promise<{ docxUrl?: string; pptxUrl?: string }> {
  const isArabic = opts.language === "ar";
  const colors = TEMPLATE_COLORS[opts.templateName] ?? TEMPLATE_COLORS["default"];
  const sections = parseContent(opts.generatedContent, isArabic);
  const direction = isArabic ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const bidi = isArabic;

  const imageBuffers: Buffer[] = [];
  for (const url of opts.selectedImages.slice(0, 10)) {
    const buf = await fetchImageBuffer(url);
    if (buf) imageBuffers.push(buf);
  }

  let uniLogoBuf: Buffer | null = null;
  let facLogoBuf: Buffer | null = null;
  if (opts.universityLogoUrl) uniLogoBuf = await fetchImageBuffer(opts.universityLogoUrl);
  if (opts.facultyLogoUrl) facLogoBuf = await fetchImageBuffer(opts.facultyLogoUrl);

  if (opts.documentType === "word") {
    const buffer = await buildWordDocument({ opts, colors, sections, imageBuffers, uniLogoBuf, facLogoBuf, isArabic, direction, bidi });
    const filename = `project_${opts.projectId}_${Date.now()}.docx`;
    const url = await uploadToCloudinary(buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename, env.cloudName, env.apiKey, env.apiSecret);
    return { docxUrl: url };
  } else {
    const buffer = await buildPptxDocument({ opts, colors, sections, imageBuffers, uniLogoBuf, facLogoBuf, isArabic });
    const filename = `project_${opts.projectId}_${Date.now()}.pptx`;
    const url = await uploadToCloudinary(buffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", filename, env.cloudName, env.apiKey, env.apiSecret);
    return { pptxUrl: url };
  }
}

interface BuildArgs {
  opts: DocGenOptions;
  colors: { primary: string; light: string; dark: string };
  sections: Section[];
  imageBuffers: Buffer[];
  uniLogoBuf: Buffer | null;
  facLogoBuf: Buffer | null;
  isArabic: boolean;
  direction?: (typeof AlignmentType)[keyof typeof AlignmentType];
  bidi?: boolean;
}

async function buildWordDocument({ opts, colors, sections, imageBuffers, uniLogoBuf, facLogoBuf, isArabic, direction, bidi }: BuildArgs): Promise<Buffer> {
  const PRIMARY = colors.primary;
  const LIGHT = colors.light;
  const today = new Date().toLocaleDateString(isArabic ? "ar-EG" : "en-US", { year: "numeric", month: "long", day: "numeric" });

  const makePara = (text: string, opts2?: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; bold?: boolean; size?: number; color?: string; center?: boolean; bidiLocal?: boolean; spaceAfter?: number; spaceBefore?: number }) => {
    const o = opts2 ?? {};
    return new Paragraph({
      heading: o.heading,
      alignment: o.center ? AlignmentType.CENTER : (direction ?? AlignmentType.LEFT),
      bidirectional: bidi,
      spacing: { after: o.spaceAfter ?? 120, before: o.spaceBefore ?? 0 },
      children: [
        new TextRun({
          text,
          bold: o.bold ?? false,
          size: (o.size ?? 22),
          color: o.color ?? "000000",
          font: isArabic ? "Amiri" : "Calibri",
          rtl: bidi,
        }),
      ],
    });
  };

  const coverChildren: Paragraph[] = [];

  const colorBarRow = new TableRow({
    children: [new TableCell({
      shading: { fill: PRIMARY, type: ShadingType.SOLID, color: PRIMARY },
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: convertInchesToTwip(0.6), bottom: convertInchesToTwip(0.6), left: 0, right: 0 },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: isArabic ? "مشروع تخرج" : "Graduation Project", color: "FFFFFF", bold: true, size: 32, font: isArabic ? "Amiri" : "Calibri" })],
      })],
    })],
  });

  const logoRow = new TableRow({
    children: [new TableCell({
      shading: { fill: LIGHT, type: ShadingType.SOLID, color: LIGHT },
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } },
      margins: { top: convertInchesToTwip(0.3), bottom: convertInchesToTwip(0.3), left: convertInchesToTwip(0.3), right: convertInchesToTwip(0.3) },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          ...(uniLogoBuf ? [new ImageRun({ data: uniLogoBuf, transformation: { width: 80, height: 80 }, type: "png" })] : []),
          ...(uniLogoBuf && facLogoBuf ? [new TextRun({ text: "    " })] : []),
          ...(facLogoBuf ? [new ImageRun({ data: facLogoBuf, transformation: { width: 80, height: 80 }, type: "png" })] : []),
        ],
      })],
    })],
  });

  const hasTitleLogoRow = uniLogoBuf || facLogoBuf;

  const coverTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideH: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideV: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    rows: [
      colorBarRow,
      ...(hasTitleLogoRow ? [logoRow] : []),
    ],
  });

  coverChildren.push(new Paragraph({ children: [coverTable as never] }));
  coverChildren.push(new Paragraph({ spacing: { before: 800 } }));
  coverChildren.push(makePara(opts.topic, { bold: true, size: 48, color: PRIMARY, center: true, spaceBefore: 400, spaceAfter: 400 }));
  coverChildren.push(new Paragraph({ spacing: { before: 400 } }));
  coverChildren.push(makePara(isArabic ? `الطلاب: ${opts.studentNames.join(" / ")}` : `Students: ${opts.studentNames.join(" / ")}`, { bold: true, size: 28, center: true, color: "334155" }));
  coverChildren.push(makePara(isArabic ? `المشرف: ${opts.supervisorName}` : `Supervisor: ${opts.supervisorName}`, { size: 26, center: true, color: "475569" }));
  coverChildren.push(makePara(isArabic ? `القسم: ${opts.department}` : `Department: ${opts.department}`, { size: 26, center: true, color: "475569" }));
  coverChildren.push(makePara(today, { size: 22, center: true, color: "94A3B8", spaceBefore: 300 }));

  const bodyChildren: Paragraph[] = [];
  let imgIndex = 0;

  for (const section of sections) {
    if (section.heading) {
      bodyChildren.push(new Paragraph({ spacing: { before: 360, after: 160 }, bidirectional: bidi, alignment: direction ?? AlignmentType.LEFT, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PRIMARY } }, children: [new TextRun({ text: section.heading, bold: true, color: PRIMARY, size: 28, font: isArabic ? "Amiri" : "Calibri", rtl: bidi })] }));
    }
    for (const para of section.paragraphs) {
      const cleaned = para.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
      if (!cleaned) continue;
      bodyChildren.push(makePara(cleaned, { size: 22, spaceAfter: 160 }));
    }
    if (imgIndex < imageBuffers.length && (section.heading || section.paragraphs.length > 0)) {
      const imgBuf = imageBuffers[imgIndex++];
      bodyChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 160 },
        children: [new ImageRun({ data: imgBuf, transformation: { width: 400, height: 280 }, type: "jpeg" })],
      }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: { type: SectionType.NEXT_PAGE },
        children: coverChildren,
      },
      {
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: opts.topic.substring(0, 60), color: "94A3B8", size: 18, font: isArabic ? "Amiri" : "Calibri" })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], color: "94A3B8", size: 18 }), new TextRun({ text: " / ", color: "94A3B8", size: 18 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "94A3B8", size: 18 })] })] }) },
        children: bodyChildren,
      },
    ],
    styles: {
      paragraphStyles: [],
    },
  });

  return await Packer.toBuffer(doc);
}

async function buildPptxDocument({ opts, colors, sections, imageBuffers, uniLogoBuf, facLogoBuf, isArabic }: BuildArgs): Promise<Buffer> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  const hexPrimary = `#${colors.primary}`;
  const hexLight = `#${colors.light}`;
  const isDark = opts.templateName === "dark";

  pptx.layout = "LAYOUT_16x9";
  pptx.author = opts.studentNames.join(", ");
  pptx.subject = opts.topic;

  const bgColor = isDark ? "1E293B" : "FFFFFF";
  const textColor = isDark ? "F1F5F9" : "1E293B";
  const slideHeaderBg = colors.primary;

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: bgColor };

  titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 1.2, fill: { color: slideHeaderBg } });
  titleSlide.addText(isArabic ? "مشروع تخرج" : "Graduation Project", { x: 0, y: 0.1, w: "100%", h: 0.6, align: "center", color: "FFFFFF", bold: true, fontSize: 24, fontFace: isArabic ? "Arial" : "Calibri" });

  if (uniLogoBuf || facLogoBuf) {
    let logoX = 0.3;
    if (uniLogoBuf) {
      titleSlide.addImage({ data: `data:image/png;base64,${uniLogoBuf.toString("base64")}`, x: logoX, y: 1.4, w: 1.0, h: 1.0, sizing: { type: "contain", w: 1.0, h: 1.0 } });
      logoX += 1.2;
    }
    if (facLogoBuf) {
      titleSlide.addImage({ data: `data:image/png;base64,${facLogoBuf.toString("base64")}`, x: logoX, y: 1.4, w: 1.0, h: 1.0, sizing: { type: "contain", w: 1.0, h: 1.0 } });
    }
  }

  titleSlide.addText(opts.topic, { x: 0.5, y: 2.6, w: 9, h: 1.5, align: "center", color: hexPrimary.replace("#", ""), bold: true, fontSize: 28, fontFace: isArabic ? "Arial" : "Calibri", wrap: true });
  titleSlide.addText([
    { text: (isArabic ? "الطلاب: " : "Students: ") + opts.studentNames.join(" / "), options: { color: textColor, fontSize: 16, bold: true, breakLine: true } },
    { text: (isArabic ? "المشرف: " : "Supervisor: ") + opts.supervisorName, options: { color: textColor, fontSize: 14, breakLine: true } },
    { text: (isArabic ? "القسم: " : "Dept: ") + opts.department, options: { color: textColor, fontSize: 14 } },
  ], { x: 0.5, y: 4.4, w: 9, h: 1.4, align: "center", fontFace: isArabic ? "Arial" : "Calibri" });

  let imgIndex = 0;

  for (const section of sections.slice(0, Math.min(sections.length, opts.pageCount))) {
    if (!section.heading && section.paragraphs.length === 0) continue;

    const slide = pptx.addSlide();
    slide.background = { color: bgColor };

    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.8, fill: { color: slideHeaderBg } });

    if (section.heading) {
      slide.addText(section.heading, { x: 0.3, y: 0.08, w: 9.4, h: 0.65, color: "FFFFFF", bold: true, fontSize: 20, fontFace: isArabic ? "Arial" : "Calibri", align: isArabic ? "right" : "left", rtlMode: isArabic });
    }

    const hasImage = imgIndex < imageBuffers.length;
    const textW = hasImage ? 5.5 : 9.4;
    const bodyText = section.paragraphs.map(p => p.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim()).filter(Boolean).join("\n\n");

    if (bodyText) {
      slide.addText(bodyText, {
        x: isArabic ? (hasImage ? 3.7 : 0.3) : 0.3,
        y: 1.0, w: textW, h: 4.5,
        color: textColor, fontSize: 14, fontFace: isArabic ? "Arial" : "Calibri",
        align: isArabic ? "right" : "left", rtlMode: isArabic,
        valign: "top", wrap: true,
      });
    }

    if (hasImage) {
      const imgBuf = imageBuffers[imgIndex++];
      slide.addImage({
        data: `data:image/jpeg;base64,${imgBuf.toString("base64")}`,
        x: isArabic ? 0.3 : 6.0, y: 1.0, w: 3.5, h: 4.2,
        sizing: { type: "contain", w: 3.5, h: 4.2 },
      });
    }
  }

  const result = await (pptx.write as (t: string) => Promise<Buffer>)("nodebuffer");
  return result;
}
