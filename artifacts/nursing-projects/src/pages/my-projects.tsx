import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Layout, StatusBadge } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { Folder, ChevronRight, ChevronLeft, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth";

type Project = {
  id: string;
  topic: string;
  studentNames: string[];
  supervisorName: string;
  department: string;
  language: string;
  documentType: string;
  status: string;
  createdAt: string;
};

async function fetchProjectsByStudentId(studentId: string, base: string): Promise<Project[]> {
  const res = await fetch(`${base}/api/projects?studentId=${encodeURIComponent(studentId)}&limit=100&offset=0`);
  if (!res.ok) throw new Error("Failed to load");
  const data = await res.json();
  return data.projects ?? [];
}

export default function MyProjectsPage() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(false);
    fetchProjectsByStudentId(user.uid, base)
      .then((data) => {
        setProjects(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [user, base]);

  const statusToPath = (project: Project) => {
    if (project.status === "draft") return `/generate/${project.id}`;
    if (project.status === "generating") return `/generate/${project.id}`;
    if (project.status === "images_pending") return `/generate/${project.id}`;
    if (project.status === "payment_pending") return `/payment/${project.id}`;
    return `/status/${project.id}`;
  };

  const isContinuable = (status: string) =>
    ["draft", "generating", "images_pending", "payment_pending"].includes(status);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Folder className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-foreground">{t("myProjectsTitle")}</h1>
              <p className="text-xs text-muted-foreground">{t("myProjectsHint")}</p>
            </div>
          </div>
          <Link href="/">
            <Button className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              {t("newProject")}
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed bg-muted/20">
            <p className="text-sm text-destructive">{t("errorOccurred")}</p>
          </div>
        ) : projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed bg-muted/20"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <Folder className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="font-medium text-foreground mb-1">{t("myProjectsEmpty")}</p>
            <p className="text-sm text-muted-foreground mb-6">{t("myProjectsHint")}</p>
            <Link href="/">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t("newProject")}
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {projects.map((project, i) => {
                const continuable = isContinuable(project.status);
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-xl border bg-card shadow-xs overflow-hidden"
                  >
                    <div className="p-4 flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm text-foreground truncate">{project.topic}</span>
                          <StatusBadge status={project.status} />
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {(project.studentNames as string[]).join(" / ")}
                        </p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="text-xs text-muted-foreground/60">
                            {new Date(project.createdAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            {project.documentType === "word" ? "Word" : "PowerPoint"}
                          </span>
                          <span className="text-xs text-muted-foreground/60">
                            {project.language === "ar" ? "عربي" : "English"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={statusToPath(project)}>
                          <Button
                            size="sm"
                            variant={continuable ? "default" : "outline"}
                            className={cn("gap-1.5 text-xs", continuable && "bg-primary")}
                          >
                            {continuable ? t("continueProject") : t("viewProject")}
                            {isRTL
                              ? <ChevronLeft className="h-3.5 w-3.5" />
                              : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </Layout>
  );
}
