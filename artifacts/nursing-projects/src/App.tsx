import "./lib/i18n";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import HomePage from "@/pages/home";
import GeneratePage from "@/pages/generate";
import PaymentPage from "@/pages/payment";
import StatusPage from "@/pages/status";
import AdminPage from "@/pages/admin";
import AdminStatsPage from "@/pages/admin-stats";
import MyProjectsPage from "@/pages/my-projects";
import PreviewPage from "@/pages/preview";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/contexts/auth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation("/login");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return null;
  return <Component />;
}

function AppShell() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const dir = i18n.language === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={() => <ProtectedRoute component={HomePage} />} />
      <Route path="/my-projects" component={() => <ProtectedRoute component={MyProjectsPage} />} />
      <Route path="/generate/:id" component={GeneratePage} />
      <Route path="/payment/:id" component={PaymentPage} />
      <Route path="/status/:id" component={StatusPage} />
      <Route path="/preview/:id" component={PreviewPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/stats" component={AdminStatsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
