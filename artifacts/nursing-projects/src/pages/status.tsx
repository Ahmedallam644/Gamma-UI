import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useGetProject, getGetProjectQueryKey } from "@workspace/api-client-react";
import { Layout, StatusBadge } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, Clock, CheckCircle2, XCircle, Loader2, RefreshCcw, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_STEPS = ["draft", "generating", "images_pending", "payment_pending", "pending_approval", "completed"] as const;

function getStepIndex(status: string): number {
  const idx = STATUS_STEPS.indexOf(status as never);
  return idx === -1 ? (status === "rejected" ? -1 : 0) : idx;
}

export default function StatusPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: project, isLoading } = useGetProject(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetProjectQueryKey(id!),
      refetchInterval: (data) => {
        const status = (data as { status?: string } | undefined)?.status;
        if (!status) return 5000;
        if (["completed", "rejected"].includes(status)) return false;
        return 8000;
      },
    },
  });

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: t("copied") });
  };

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

  const currentStep = getStepIndex(project.status);
  const isRejected = project.status === "rejected";
  const isCompleted = project.status === "completed";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden mb-6">
            <div className="p-6 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-bold text-lg text-foreground mb-1">{t("statusTitle")}</h1>
                  <p className="text-sm text-muted-foreground truncate max-w-xs">{project.topic}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>
            </div>

            {isRejected ? (
              <div className="p-6">
                <div className="flex items-start gap-4 rounded-xl bg-destructive/10 border border-destructive/20 p-4">
                  <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm text-destructive mb-1">{t("rejected")}</p>
                    {project.rejectionReason && (
                      <p className="text-sm text-muted-foreground">{project.rejectionReason}</p>
                    )}
                  </div>
                </div>
                <Button className="mt-4 w-full" onClick={() => setLocation("/")}>{t("newProject")}</Button>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex flex-col gap-3">
                  {STATUS_STEPS.map((step, i) => {
                    const isActive = i === currentStep;
                    const isDone = i < currentStep;
                    return (
                      <div key={step} className="flex items-center gap-4">
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                          isDone ? "bg-primary border-primary" :
                          isActive ? "border-primary bg-primary/10" :
                          "border-border bg-muted"
                        )}>
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                          ) : isActive ? (
                            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                          )}
                        </div>
                        <div className="flex flex-1 items-center justify-between">
                          <span className={cn(
                            "text-sm font-medium",
                            isActive ? "text-foreground" : isDone ? "text-muted-foreground" : "text-muted-foreground/60"
                          )}>
                            {t(step)}
                          </span>
                          {isActive && (
                            <span className="text-xs text-primary font-medium animate-pulse">
                              {isActive ? (isCompleted ? "" : "...") : ""}
                            </span>
                          )}
                        </div>
                        {i < STATUS_STEPS.length - 1 && (
                          <div className="absolute ms-4 mt-8 h-3 w-0.5 bg-border" style={{ display: "none" }} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {isCompleted && (project.docxDownloadUrl || project.pptxDownloadUrl) && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 flex flex-col gap-3">
                    <div className="h-px bg-border" />
                    {project.documentType === "word" && project.docxDownloadUrl && (
                      <a href={project.docxDownloadUrl} target="_blank" rel="noopener noreferrer">
                        <Button className="w-full gap-2" variant="default" data-testid="btn-download-docx">
                          <Download className="h-4 w-4" />
                          {t("downloadWord")}
                        </Button>
                      </a>
                    )}
                    {project.documentType === "pptx" && project.pptxDownloadUrl && (
                      <a href={project.pptxDownloadUrl} target="_blank" rel="noopener noreferrer">
                        <Button className="w-full gap-2" variant="default" data-testid="btn-download-pptx">
                          <Download className="h-4 w-4" />
                          {t("downloadPPT")}
                        </Button>
                      </a>
                    )}
                  </motion.div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-muted/30 divide-y text-sm">
            <div className="grid grid-cols-2 px-4 py-2.5 gap-2">
              <span className="text-muted-foreground text-xs">{t("projectId")}</span>
              <span className="text-xs font-mono text-end">{project.id}</span>
            </div>
            <div className="grid grid-cols-2 px-4 py-2.5 gap-2">
              <span className="text-muted-foreground text-xs">{t("createdAt")}</span>
              <span className="text-xs text-end">{new Date(project.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1 gap-2" onClick={copyLink} data-testid="btn-copy-link">
              <Copy className="h-4 w-4" />
              {t("copyLink")}
            </Button>
            <Button variant="outline" size="icon" onClick={() => window.location.reload()} data-testid="btn-refresh">
              <RefreshCcw className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
