import "./lib/i18n";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import HomePage from "@/pages/home";
import GeneratePage from "@/pages/generate";
import PaymentPage from "@/pages/payment";
import StatusPage from "@/pages/status";
import AdminPage from "@/pages/admin";
import AdminStatsPage from "@/pages/admin-stats";
import MyProjectsPage from "@/pages/my-projects";
import PreviewPage from "@/pages/preview";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AppShell() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const dir = i18n.language === "ar" ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/generate/:id" component={GeneratePage} />
      <Route path="/payment/:id" component={PaymentPage} />
      <Route path="/status/:id" component={StatusPage} />
      <Route path="/my-projects" component={MyProjectsPage} />
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
          <AppShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
