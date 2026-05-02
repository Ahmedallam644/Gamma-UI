import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useGetProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Layout, StatusBadge } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, BookOpen, Image as ImageIcon } from "lucide-react";

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const isRTL = i18n.language === "ar";

  const { data: project, isLoading } = useGetProject(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetProjectQueryKey(id!),
      refetchInterval: false,
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">{t("errorOccurred")}</p>
          <Button variant="outline" onClick={() => setLocation("/")} className="mt-4">{t("back")}</Button>
        </div>
      </Layout>
    );
  }

  const paragraphs = (project.generatedContent ?? "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const images = (project.selectedImages ?? []) as string[];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => setLocation(`/status/${id}`)} className="gap-1.5 text-muted-foreground">
              <ArrowLeft className={`h-4 w-4 ${isRTL ? "rotate-180" : ""}`} />
              {t("back")}
            </Button>
            <div className="flex-1" />
            <StatusBadge status={project.status} />
          </div>

          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden mb-6">
            <div className="px-6 py-5 border-b bg-muted/20 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-base text-foreground leading-tight">{project.topic}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(project.studentNames as string[]).join(" · ")} — {project.supervisorName}
                </p>
              </div>
            </div>

            <div className={`px-6 py-6 prose prose-sm max-w-none ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
              {paragraphs.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">{t("noProjects")}</p>
              ) : (
                paragraphs.map((para, i) => {
                  const clean = para.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
                  if (!clean) return null;
                  const isHeading = para.length < 100 && (
                    /^#{1,3}\s/.test(para) ||
                    /^(الفصل|المقدمة|الخاتمة|التوصيات|الأهداف|الإطار|المراجع|ملخص|الأساليب|الطرق|النتائج|المناقشة|أهمية|خلفية|Chapter|Introduction|Conclusion|Recommendations|Objectives|Framework|References|Summary|Abstract|Methods|Results|Discussion|Importance|Background)/i.test(clean) ||
                    /^\*\*[^*]+\*\*:?\s*$/.test(para)
                  );
                  return isHeading ? (
                    <h3
                      key={i}
                      className="font-semibold text-primary mt-6 mb-2 text-base border-b border-primary/20 pb-1.5"
                    >
                      {clean}
                    </h3>
                  ) : (
                    <p key={i} className="text-sm text-foreground/85 leading-relaxed mb-3 whitespace-pre-line">
                      {clean}
                    </p>
                  );
                })
              )}
            </div>
          </div>

          {images.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/20 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">
                    {isRTL ? "الصور المختارة" : "Selected Images"}
                  </span>
                  <span className="text-xs text-muted-foreground">({images.length})</span>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {images.map((url, i) => (
                    <div key={i} className="aspect-video rounded-lg overflow-hidden border bg-muted">
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <div className="mt-6 rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 text-center">
            {isRTL
              ? "هذه معاينة للمحتوى فقط · ملف التحميل سيُتاح بعد موافقة المشرف"
              : "This is a read-only preview · The download file will be available after admin approval"}
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
