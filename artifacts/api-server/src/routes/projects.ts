import { Router } from "express";
import { db } from "@workspace/db";
import { projectsTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { generateAndUploadDocument } from "../services/document-generator.js";
import {
  CreateProjectBody,
  ListProjectsQueryParams,
  GetProjectParams,
  SelectProjectImagesBody,
  SelectProjectImagesParams,
  UploadPaymentReceiptBody,
  UploadPaymentReceiptParams,
  ApproveProjectParams,
  RejectProjectBody,
  RejectProjectParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/projects", async (req, res) => {
  try {
    const query = ListProjectsQueryParams.parse(req.query);
    const studentId = req.query.studentId as string | undefined;
    const conditions = [];
    if (query.status) {
      conditions.push(eq(projectsTable.status, query.status));
    }
    if (studentId) {
      conditions.push(eq(projectsTable.studentId, studentId));
    }
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions.length === 1 ? conditions[0] : undefined;
    const projects = await db
      .select()
      .from(projectsTable)
      .where(whereClause)
      .orderBy(desc(projectsTable.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const [{ value: total }] = await db
      .select({ value: count() })
      .from(projectsTable)
      .where(whereClause);

    res.json({ projects: projects.map(formatProject), total: Number(total) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects", async (req, res) => {
  try {
    const body = CreateProjectBody.parse(req.body);
    const [project] = await db
      .insert(projectsTable)
      .values({
        topic: body.topic,
        studentNames: body.studentNames,
        supervisorName: body.supervisorName,
        department: body.department,
        language: body.language,
        documentType: body.documentType ?? "word",
        pageCount: body.pageCount ?? 20,
        templateName: body.templateName ?? "default",
        universityLogoUrl: body.universityLogoUrl ?? null,
        facultyLogoUrl: body.facultyLogoUrl ?? null,
        studentId: body.studentId ?? null,
        status: "draft",
      })
      .returning();
    res.status(201).json(formatProject(project));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/projects/:id", async (req, res) => {
  try {
    const { id } = GetProjectParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, parseInt(id)));
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(formatProject(project));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/generate", async (req, res) => {
  try {
    const { id } = GenerateProjectContentParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, parseInt(id)));
    if (!project) return res.status(404).json({ error: "Project not found" });

    await db
      .update(projectsTable)
      .set({ status: "generating", updatedAt: new Date() })
      .where(eq(projectsTable.id, parseInt(id)));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data: string) => {
      res.write(`data: ${JSON.stringify({ text: data })}\n\n`);
    };

    const content = await generateWithFallback(project, send);

    await db
      .update(projectsTable)
      .set({
        status: "images_pending",
        generatedContent: content,
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, parseInt(id)));

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error(err);
    res.write(`data: ${JSON.stringify({ error: "Generation failed" })}\n\n`);
    res.end();
  }
});

router.post("/projects/:id/select-images", async (req, res) => {
  try {
    const { id } = SelectProjectImagesParams.parse(req.params);
    const body = SelectProjectImagesBody.parse(req.body);
    const [project] = await db
      .update(projectsTable)
      .set({
        selectedImages: body.imageUrls,
        status: "payment_pending",
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, parseInt(id)))
      .returning();
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(formatProject(project));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/upload-receipt", async (req, res) => {
  try {
    const { id } = UploadPaymentReceiptParams.parse(req.params);
    const body = UploadPaymentReceiptBody.parse(req.body);
    const [project] = await db
      .update(projectsTable)
      .set({
        receiptUrl: body.receiptUrl,
        status: "pending_approval",
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, parseInt(id)))
      .returning();
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(formatProject(project));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/approve", async (req, res) => {
  try {
    const { id } = ApproveProjectParams.parse(req.params);
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, parseInt(id)));
    if (!project) return res.status(404).json({ error: "Project not found" });

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "";
    const apiKey = process.env.CLOUDINARY_API_KEY ?? "";
    const apiSecret = process.env.CLOUDINARY_API_SECRET ?? "";

    let docxDownloadUrl: string | null = project.docxDownloadUrl ?? null;
    let pptxDownloadUrl: string | null = project.pptxDownloadUrl ?? null;

    if (project.generatedContent && cloudName && apiKey && apiSecret) {
      try {
        const result = await generateAndUploadDocument(
          {
            topic: project.topic,
            studentNames: project.studentNames as string[],
            supervisorName: project.supervisorName,
            department: project.department,
            language: project.language,
            documentType: project.documentType ?? "word",
            templateName: project.templateName ?? "default",
            pageCount: project.pageCount ?? 20,
            generatedContent: project.generatedContent,
            selectedImages: (project.selectedImages as string[]) ?? [],
            universityLogoUrl: project.universityLogoUrl,
            facultyLogoUrl: project.facultyLogoUrl,
            projectId: String(project.id),
          },
          { cloudName, apiKey, apiSecret }
        );
        if (result.docxUrl) docxDownloadUrl = result.docxUrl;
        if (result.pptxUrl) pptxDownloadUrl = result.pptxUrl;
      } catch (genErr) {
        req.log.error(genErr, "Document generation failed, approving without download link");
      }
    }

    const [updated] = await db
      .update(projectsTable)
      .set({
        status: "completed",
        docxDownloadUrl,
        pptxDownloadUrl,
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, parseInt(id)))
      .returning();

    res.json(formatProject(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/reject", async (req, res) => {
  try {
    const { id } = RejectProjectParams.parse(req.params);
    const body = RejectProjectBody.parse(req.body);
    const [project] = await db
      .update(projectsTable)
      .set({
        status: "rejected",
        rejectionReason: body.reason,
        updatedAt: new Date(),
      })
      .where(eq(projectsTable.id, parseInt(id)))
      .returning();
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(formatProject(project));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

function formatProject(p: typeof projectsTable.$inferSelect) {
  return {
    id: String(p.id),
    topic: p.topic,
    studentNames: p.studentNames as string[],
    supervisorName: p.supervisorName,
    department: p.department,
    language: p.language,
    documentType: p.documentType ?? "word",
    pageCount: p.pageCount ?? 20,
    templateName: p.templateName ?? "default",
    status: p.status,
    generatedContent: p.generatedContent ?? null,
    selectedImages: (p.selectedImages as string[]) ?? null,
    receiptUrl: p.receiptUrl ?? null,
    universityLogoUrl: p.universityLogoUrl ?? null,
    facultyLogoUrl: p.facultyLogoUrl ?? null,
    docxDownloadUrl: p.docxDownloadUrl ?? null,
    pptxDownloadUrl: p.pptxDownloadUrl ?? null,
    rejectionReason: p.rejectionReason ?? null,
    outline: p.outline ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

import { GenerateProjectContentParams } from "@workspace/api-zod";

router.post("/projects/:id/generate-outline", async (req, res) => {
  try {
    const { id } = GenerateProjectContentParams.parse(req.params);
    const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, parseInt(id)));
    if (!project) return res.status(404).json({ error: "Project not found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data: string) => { res.write(`data: ${JSON.stringify({ text: data })}\n\n`); };
    const outline = await generateOutlineWithFallback(project, send);

    await db.update(projectsTable).set({ outline, updatedAt: new Date() }).where(eq(projectsTable.id, parseInt(id)));
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error(err);
    res.write(`data: ${JSON.stringify({ error: "Outline generation failed" })}\n\n`);
    res.end();
  }
});

router.patch("/projects/:id/save-outline", async (req, res) => {
  try {
    const { id } = GenerateProjectContentParams.parse(req.params);
    const outline = req.body?.outline;
    if (!outline || typeof outline !== "string") return res.status(400).json({ error: "outline is required" });
    const [project] = await db.update(projectsTable)
      .set({ outline, updatedAt: new Date() })
      .where(eq(projectsTable.id, parseInt(id)))
      .returning();
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(formatProject(project));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function generateWithFallback(
  project: typeof projectsTable.$inferSelect,
  send: (text: string) => void
): Promise<string> {
  const isArabic = project.language === "ar";

  const systemPrompt = isArabic
    ? `أنت خبير أكاديمي متخصص في كتابة الأبحاث العلمية لطلاب التمريض. اكتب المحتوى الأكاديمي فقط بالعربية الفصحى.
قواعد صارمة يجب اتباعها:
- لا تكتب عنوان البحث أو "مشروع التخرج" أو اسم الطالب أو المشرف أو القسم - هذه موجودة في صفحة الغلاف
- ابدأ مباشرة من عنوان القسم الأول: **المقدمة:**
- استخدم التنسيق: **عنوان القسم:** لكل قسم
- اكتب بأسلوب أكاديمي رصين
- لا تضف توثيقات داخلية مثل (المؤلف، السنة) أو (Smith, 2022) داخل الجمل - التوثيق يكون في قسم المراجع فقط
- اكتب المراجع كاملة ومرقمة في قسم المراجع بتنسيق APA`
    : `You are an academic expert writing nursing research papers. Write ONLY the academic content body in English.
Strict rules:
- Do NOT write the document title, "graduation project", student names, supervisor, or department - those are on the cover page
- Start directly with the first section heading: **Introduction:**
- Use format: **Section Title:** for each section
- Write in formal academic style
- Do NOT add inline citations like (Author et al., 2022) or (Smith, 2022) within the text body - all references go in the References section only
- Write complete numbered APA-format references in the References section`;

  const outlineCtx = project.outline
    ? (isArabic
      ? `المخطط البحثي المعتمد:\n${project.outline}\n\nاتبع هذا المخطط وأضف محتوى أكاديمياً وافياً لكل نقطة:\n\n`
      : `Approved Research Outline:\n${project.outline}\n\nFollow this outline and write thorough academic content for each point:\n\n`)
    : "";

  const userPrompt = isArabic
    ? `${outlineCtx}اكتب بحثاً علمياً أكاديمياً شاملاً حول موضوع: "${project.topic}"
القسم: ${project.department}
عدد الصفحات المطلوب: ${project.pageCount ?? 20}

ابدأ مباشرة بالأقسام الأكاديمية بهذا الترتيب (لا تضف أي مقدمة قبل المقدمة):
**المقدمة:**
**أهمية الموضوع:**
**الأهداف:**
**الإطار النظري:**
**الفصل الأول:**
**الفصل الثاني:**
**الفصل الثالث:**
**النتائج والمناقشة:**
**التوصيات:**
**الخاتمة:**
**المراجع:**
اكتب 6-8 مراجع كاملة مرقمة بتنسيق APA (من 2020-2025):
1. اسم المؤلف. (السنة). عنوان المقالة. اسم المجلة، المجلد(العدد)، الصفحات.

اكتب محتوى وافياً واحترافياً لكل قسم.`
    : `${outlineCtx}Write a comprehensive academic research paper on the topic: "${project.topic}"
Department: ${project.department}
Required length: ${project.pageCount ?? 20} pages

Start directly with the academic sections in this order (do NOT add anything before Introduction):
**Introduction:**
**Importance:**
**Objectives:**
**Theoretical Framework:**
**Chapter 1:**
**Chapter 2:**
**Chapter 3:**
**Results and Discussion:**
**Recommendations:**
**Conclusion:**
**References:**
Write 6-8 complete numbered APA references (from 2020-2025):
1. Last, F. M. (Year). Title of article. Journal Name, Volume(Issue), pages.

Write thorough, professional content for each section.`;

  const keys = [
    { provider: "groq", key: process.env.GROQ_KEY_1, model: "llama-3.3-70b-versatile" },
    { provider: "groq", key: process.env.GROQ_KEY_2, model: "llama-3.3-70b-versatile" },
    { provider: "openrouter", key: process.env.OPENROUTER_KEY_1, model: "meta-llama/llama-3.3-70b-instruct" },
    { provider: "openrouter", key: process.env.OPENROUTER_KEY_2, model: "meta-llama/llama-3.3-70b-instruct" },
    { provider: "gemini", key: process.env.GEMINI_API_KEY, model: "gemini-2.0-flash" },
  ];

  let fullContent = "";

  for (const { provider, key, model } of keys) {
    if (!key) continue;
    try {
      if (provider === "groq" || provider === "openrouter") {
        const baseUrl =
          provider === "groq"
            ? "https://api.groq.com/openai/v1"
            : "https://openrouter.ai/api/v1";

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            stream: true,
            max_tokens: 4000,
          }),
        });

        if (!response.ok || !response.body) continue;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.choices?.[0]?.delta?.content ?? "";
              if (chunk) {
                fullContent += chunk;
                send(chunk);
              }
            } catch {}
          }
        }
        return fullContent;
      } else if (provider === "gemini") {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
              ],
              generationConfig: { maxOutputTokens: 4000 },
            }),
          }
        );

        if (!response.ok || !response.body) continue;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              const chunk =
                parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              if (chunk) {
                fullContent += chunk;
                send(chunk);
              }
            } catch {}
          }
        }
        return fullContent;
      }
    } catch (err) {
      continue;
    }
  }

  const fallback = isArabic
    ? "عذراً، حدث خطأ أثناء توليد المحتوى. يرجى المحاولة مرة أخرى."
    : "Sorry, an error occurred during content generation. Please try again.";
  send(fallback);
  return fallback;
}

async function generateOutlineWithFallback(
  project: typeof projectsTable.$inferSelect,
  send: (text: string) => void
): Promise<string> {
  const isArabic = project.language === "ar";

  const systemPrompt = isArabic
    ? `أنت خبير أكاديمي. مهمتك إنشاء مخطط بحثي منظم فقط. لا تكتب محتوى نصياً، فقط العناوين الرئيسية والنقاط الفرعية المختصرة.`
    : `You are an academic expert. Your task is to generate a structured research outline ONLY. Do not write content, only headings and concise sub-points.`;

  const userPrompt = isArabic
    ? `أنشئ مخططاً بحثياً أكاديمياً منظماً لموضوع: "${project.topic}"
القسم: ${project.department}

اكتب المخطط بهذا الشكل بالضبط (8-10 أقسام رئيسية مع نقاط فرعية):
**المقدمة:**
- نقطة فرعية 1
- نقطة فرعية 2

**أهمية الموضوع:**
- نقطة فرعية 1
- نقطة فرعية 2

**الأهداف:**
- هدف 1
- هدف 2
- هدف 3

**الإطار النظري:**
- نقطة فرعية 1
- نقطة فرعية 2

**الفصل الأول: [عنوان مناسب للموضوع]:**
- نقطة فرعية 1
- نقطة فرعية 2

**الفصل الثاني: [عنوان مناسب للموضوع]:**
- نقطة فرعية 1
- نقطة فرعية 2

**الفصل الثالث: [عنوان مناسب للموضوع]:**
- نقطة فرعية 1
- نقطة فرعية 2

**النتائج والمناقشة:**
- نتيجة 1
- نتيجة 2

**التوصيات:**
- توصية 1
- توصية 2

**الخاتمة:**
- نقطة ختامية 1

**المراجع:**
- مراجع أكاديمية حديثة (2020-2025)`
    : `Generate a structured academic research outline for the topic: "${project.topic}"
Department: ${project.department}

Write the outline in this exact format (8-10 main sections with sub-points):
**Introduction:**
- Sub-point 1
- Sub-point 2

**Importance of the Topic:**
- Sub-point 1
- Sub-point 2

**Objectives:**
- Objective 1
- Objective 2
- Objective 3

**Theoretical Framework:**
- Sub-point 1
- Sub-point 2

**Chapter 1: [Appropriate title for the topic]:**
- Sub-point 1
- Sub-point 2

**Chapter 2: [Appropriate title for the topic]:**
- Sub-point 1
- Sub-point 2

**Chapter 3: [Appropriate title for the topic]:**
- Sub-point 1
- Sub-point 2

**Results and Discussion:**
- Finding 1
- Finding 2

**Recommendations:**
- Recommendation 1
- Recommendation 2

**Conclusion:**
- Closing point 1

**References:**
- Recent academic references (2020-2025)`;

  const keys = [
    { provider: "groq", key: process.env.GROQ_KEY_1, model: "llama-3.3-70b-versatile" },
    { provider: "groq", key: process.env.GROQ_KEY_2, model: "llama-3.3-70b-versatile" },
    { provider: "openrouter", key: process.env.OPENROUTER_KEY_1, model: "meta-llama/llama-3.3-70b-instruct" },
    { provider: "openrouter", key: process.env.OPENROUTER_KEY_2, model: "meta-llama/llama-3.3-70b-instruct" },
    { provider: "gemini", key: process.env.GEMINI_API_KEY, model: "gemini-2.0-flash" },
  ];

  let fullContent = "";

  for (const { provider, key, model } of keys) {
    if (!key) continue;
    try {
      if (provider === "groq" || provider === "openrouter") {
        const baseUrl = provider === "groq" ? "https://api.groq.com/openai/v1" : "https://openrouter.ai/api/v1";
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            stream: true,
            max_tokens: 1500,
          }),
        });
        if (!response.ok || !response.body) continue;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.choices?.[0]?.delta?.content ?? "";
              if (chunk) { fullContent += chunk; send(chunk); }
            } catch {}
          }
        }
        return fullContent;
      } else if (provider === "gemini") {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
              generationConfig: { maxOutputTokens: 1500 },
            }),
          }
        );
        if (!response.ok || !response.body) continue;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            try {
              const parsed = JSON.parse(data);
              const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
              if (chunk) { fullContent += chunk; send(chunk); }
            } catch {}
          }
        }
        return fullContent;
      }
    } catch { continue; }
  }

  return isArabic ? "فشل إنشاء المخطط. يرجى المحاولة مرة أخرى." : "Failed to generate outline. Please try again.";
}

export default router;
