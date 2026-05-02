import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { FlaskConical, LayoutDashboard } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function Layout({ children, className }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";

  return (
    <div className={cn("min-h-screen bg-background", isRTL ? "rtl" : "ltr")}>
      <header className="sticky top-0 z-40 w-full border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-sm group-hover:shadow-md transition-all">
                <FlaskConical className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-sm text-foreground">{t("appName")}</span>
                <span className="text-xs text-muted-foreground hidden sm:block">{t("appSubtitle")}</span>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border bg-muted/50 p-0.5">
                <button
                  onClick={() => i18n.changeLanguage("ar")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    i18n.language === "ar"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="btn-lang-ar"
                >
                  العربية
                </button>
                <button
                  onClick={() => i18n.changeLanguage("en")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    i18n.language === "en"
                      ? "bg-card shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="btn-lang-en"
                >
                  English
                </button>
              </div>
              <Link href="/admin">
                <Button variant="outline" size="sm" className="gap-2 hidden sm:flex">
                  <LayoutDashboard className="h-4 w-4" />
                  {t("adminTitle")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8", className)}>
        {children}
      </main>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    generating: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    images_pending: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    payment_pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    pending_approval: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  };
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium", colors[status] ?? colors.draft)}>
      {t(status as never) || status}
    </span>
  );
}
