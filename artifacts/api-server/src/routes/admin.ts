import { Router } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";

const router = Router();

router.get("/admin/stats", async (req, res) => {
  try {
    const [{ value: totalProjects }] = await db
      .select({ value: count() })
      .from(projectsTable);

    const [{ value: pendingApproval }] = await db
      .select({ value: count() })
      .from(projectsTable)
      .where(eq(projectsTable.status, "pending_approval"));

    const [{ value: completed }] = await db
      .select({ value: count() })
      .from(projectsTable)
      .where(eq(projectsTable.status, "completed"));

    const [{ value: rejected }] = await db
      .select({ value: count() })
      .from(projectsTable)
      .where(eq(projectsTable.status, "rejected"));

    const recentProjects = await db
      .select()
      .from(projectsTable)
      .orderBy(desc(projectsTable.createdAt))
      .limit(5);

    res.json({
      totalProjects: Number(totalProjects),
      pendingApproval: Number(pendingApproval),
      completed: Number(completed),
      rejected: Number(rejected),
      recentProjects: recentProjects.map((p) => ({
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
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
