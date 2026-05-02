import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { FlaskConical, Mail, Lock, User, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const [, setLocation] = useLocation();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!displayName.trim()) { setError(t("nameRequired")); setLoading(false); return; }
        await register(email, password, displayName.trim());
      }
      setLocation("/");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError(t("wrongCredentials"));
      } else if (code === "auth/email-already-in-use") {
        setError(t("emailInUse"));
      } else if (code === "auth/weak-password") {
        setError(t("weakPassword"));
      } else if (code === "auth/invalid-email") {
        setError(t("invalidEmail"));
      } else {
        setError(t("errorOccurred"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("min-h-screen bg-background flex items-center justify-center p-4", isRTL ? "rtl" : "ltr")}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg mb-4">
            <FlaskConical className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{t("appName")}</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">{t("appSubtitle")}</p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="flex border-b">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={cn(
                "flex-1 py-3.5 text-sm font-medium transition-colors",
                mode === "login" ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("loginTab")}
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className={cn(
                "flex-1 py-3.5 text-sm font-medium transition-colors",
                mode === "register" ? "bg-primary/5 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("registerTab")}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName">{t("fullName")}</Label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("fullNamePlaceholder")}
                    className="ps-9"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("emailPlaceholder")}
                  className="ps-9"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="ps-9 pe-9"
                  required
                  minLength={6}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" className="w-full mt-1" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "login" ? t("loginBtn") : t("registerBtn"))}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          {t("adminLoginHint")}
          {" "}
          <a href="/admin" className="text-primary hover:underline">{t("adminLoginLink")}</a>
        </p>
      </motion.div>
    </div>
  );
}
