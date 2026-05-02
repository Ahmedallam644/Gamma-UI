import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Layout, StatusBadge } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Loader2, ChevronLeft, ChevronRight, TrendingUp, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminStatsPage() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";

  const { data: stats, isLoading } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey(), refetchInterval: 30000 },
  });

  const cards = stats
    ? [
        {
          label: t("totalProjects"),
          value: stats.totalProjects,
          icon: TrendingUp,
          color: "text-primary bg-primary/10",
        },
        {
          label: t("pendingApproval"),
          value: stats.pendingApproval,
          icon: Clock,
          color: "text-orange-600 bg-orange-100 dark:bg-orange-900/20",
        },
        {
          label: t("completed_count"),
          value: stats.completed,
          icon: CheckCircle2,
          color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/20",
        },
        {
          label: t("rejected_count"),
          value: stats.rejected,
          icon: XCircle,
          color: "text-destructive bg-destructive/10",
        },
      ]
    : [];

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-foreground">
          {isRTL ? "الإحصائيات" : "Statistics"}
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-32">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {cards.map(({ label, value, icon: Icon, color }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.07 }}
                className="rounded-2xl border bg-card p-5 shadow-xs"
              >
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl mb-3", color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </motion.div>
            ))}
          </div>

          {stats && stats.recentProjects.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground mb-4">
                {isRTL ? "أحدث المشاريع" : "Recent Projects"}
              </h2>
              <div className="flex flex-col gap-2">
                {stats.recentProjects.map((project, i) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, x: isRTL ? -12 : 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="flex items-center justify-between rounded-xl border bg-card px-4 py-3"
                    data-testid={`row-recent-${project.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{project.topic}</p>
                      <p className="text-xs text-muted-foreground">
                        {(project.studentNames as string[]).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                      <StatusBadge status={project.status} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
