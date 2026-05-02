import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useListProjects, getListProjectsQueryKey, useApproveProject, useRejectProject } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout, StatusBadge } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Eye, BarChart2, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const ADMIN_USER = "admin";
const ADMIN_PASS = "nursing2025";

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isRTL = i18n.language === "ar";

  const [isAuthed, setIsAuthed] = useState(() => {
    return sessionStorage.getItem("admin_authed") === "true";
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading } = useListProjects(
    filterStatus ? { status: filterStatus as never } : {},
    { query: { enabled: isAuthed, queryKey: getListProjectsQueryKey(filterStatus ? { status: filterStatus as never } : {}), refetchInterval: 15000 } }
  );

  const approveMutation = useApproveProject();
  const rejectMutation = useRejectProject();

  const handleLogin = () => {
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      sessionStorage.setItem("admin_authed", "true");
      setIsAuthed(true);
    } else {
      toast({ title: t("wrongCredentials"), variant: "destructive" });
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({}) });
      toast({ title: t("approveSuccess") });
    } catch {
      toast({ title: t("errorOccurred"), variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    try {
      await rejectMutation.mutateAsync({ id, data: { reason: rejectReason } });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey({}) });
      toast({ title: t("rejectSuccess") });
      setRejectingId(null);
      setRejectReason("");
    } catch {
      toast({ title: t("errorOccurred"), variant: "destructive" });
    }
  };

  if (!isAuthed) {
    return (
      <Layout>
        <div className="max-w-sm mx-auto pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="rounded-2xl border bg-card shadow-md p-8">
              <div className="text-center mb-6">
                <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-3">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <h1 className="font-bold text-xl text-foreground">{t("adminLogin")}</h1>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">{t("username")}</label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} data-testid="input-admin-username" className="h-10" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">{t("password")}</label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} data-testid="input-admin-password" className="h-10" />
                </div>
                <Button className="w-full h-11" onClick={handleLogin} data-testid="btn-admin-login">{t("login")}</Button>
              </div>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  const statuses = [undefined, "pending_approval", "completed", "rejected"];
  const statusLabels: Record<string, string> = {
    undefined: isRTL ? "الكل" : "All",
    pending_approval: t("pending_approval"),
    completed: t("completed"),
    rejected: t("rejected"),
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t("adminTitle")}</h1>
        <Link href="/admin/stats">
          <Button variant="outline" className="gap-2">
            <BarChart2 className="h-4 w-4" />
            {isRTL ? "الإحصائيات" : "Stats"}
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {statuses.map((s) => (
          <button
            key={String(s)}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
              filterStatus === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            )}
          >
            {statusLabels[String(s)]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-32">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      ) : !data?.projects.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t("noProjects")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.projects.map((project) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border bg-card shadow-xs overflow-hidden"
              data-testid={`card-project-${project.id}`}
            >
              <div className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm text-foreground truncate">{project.topic}</span>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(project.studentNames as string[]).join(" / ")} · {project.supervisorName}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {project.receiptUrl && (
                    <a href={project.receiptUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid={`btn-view-receipt-${project.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                        {t("viewReceipt")}
                      </Button>
                    </a>
                  )}

                  {project.status === "pending_approval" && (
                    <>
                      <Button
                        size="sm"
                        className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleApprove(project.id)}
                        disabled={approveMutation.isPending}
                        data-testid={`btn-approve-${project.id}`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                        onClick={() => setRejectingId(rejectingId === project.id ? null : project.id)}
                        data-testid={`btn-reject-${project.id}`}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        {t("reject")}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {rejectingId === project.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t bg-muted/30 px-4 py-3 flex gap-2"
                  >
                    <Input
                      placeholder={t("rejectionReason")}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="h-8 text-sm flex-1"
                      data-testid="input-rejection-reason"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(project.id)}
                      disabled={!rejectReason.trim() || rejectMutation.isPending}
                      data-testid="btn-confirm-reject"
                    >
                      {t("confirm")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>{t("cancel")}</Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </Layout>
  );
}
