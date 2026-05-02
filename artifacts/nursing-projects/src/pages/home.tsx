import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateProject } from "@workspace/api-client-react";
import { saveProjectId } from "@/lib/local-projects";
import { useAuth } from "@/contexts/auth";
import { Layout } from "@/components/layout";
import { LogoUpload } from "@/components/logo-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { Plus, Trash2, ChevronRight, ChevronLeft, GraduationCap, Users, FlaskConical, BookOpen, FileText, Presentation, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  topic: z.string().min(5, { message: "Topic must be at least 5 characters" }),
  studentNames: z.array(z.string().min(2)).min(1),
  supervisorName: z.string().min(2),
  department: z.string().min(2),
  language: z.enum(["ar", "en"]),
  documentType: z.enum(["word", "pptx"]),
  pageCount: z.number().int().min(5).max(300).default(20),
  templateName: z.string().default("default"),
  universityLogoUrl: z.string().nullable().optional(),
  facultyLogoUrl: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const STEPS = ["projectInfo", "logoUpload", "review"] as const;

const WORD_TEMPLATES = [
  { id: "word_1", labelKey: "templateWord1", color: "bg-blue-500", desc: "Classic academic layout" },
  { id: "word_2", labelKey: "templateWord2", color: "bg-indigo-500", desc: "Modern clean style" },
];

const PPTX_TEMPLATES = [
  { id: "classic", labelKey: "templateClassic", color: "bg-sky-600", desc: "Traditional blue style" },
  { id: "dark", labelKey: "templateDark", color: "bg-slate-800", desc: "Professional dark theme" },
  { id: "medical", labelKey: "templateMedical", color: "bg-emerald-600", desc: "Medical green theme" },
  { id: "modern", labelKey: "templateModern", color: "bg-violet-600", desc: "Modern gradient style" },
];

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const isRTL = i18n.language === "ar";
  const { user } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      topic: "",
      studentNames: [""],
      supervisorName: "",
      department: "",
      language: i18n.language as "ar" | "en",
      documentType: "word" as "word" | "pptx",
      pageCount: 20,
      templateName: "word_1",
      universityLogoUrl: null,
      facultyLogoUrl: null,
    },
  });

  const createProject = useCreateProject();

  const addStudent = () => {
    const names = form.getValues("studentNames");
    form.setValue("studentNames", [...names, ""]);
  };

  const removeStudent = (idx: number) => {
    const names = form.getValues("studentNames");
    if (names.length > 1) {
      form.setValue("studentNames", names.filter((_, i) => i !== idx));
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const project = await createProject.mutateAsync({
        data: {
          topic: values.topic,
          studentNames: values.studentNames.filter(Boolean),
          supervisorName: values.supervisorName,
          department: values.department,
          language: values.language,
          documentType: values.documentType,
          pageCount: values.pageCount,
          templateName: values.templateName,
          universityLogoUrl: values.universityLogoUrl ?? null,
          facultyLogoUrl: values.facultyLogoUrl ?? null,
          studentId: user?.uid ?? null,
        },
      });
      saveProjectId(project.id);
      setLocation(`/generate/${project.id}`);
    } catch {
      toast({ title: t("errorOccurred"), variant: "destructive" });
    }
  };

  const nextStep = async () => {
    if (step === 0) {
      const valid = await form.trigger(["topic", "studentNames", "supervisorName", "department", "language"]);
      if (!valid) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const docType = form.watch("documentType");
  const templates = docType === "word" ? WORD_TEMPLATES : PPTX_TEMPLATES;
  const pageUnit = isRTL
    ? (docType === "word" ? t("pagesUnit") : t("slidesUnit"))
    : (docType === "word" ? t("pagesUnit") : t("slidesUnit"));

  const features = [
    { icon: FlaskConical, label: isRTL ? "محتوى أكاديمي بالذكاء الاصطناعي" : "AI Academic Content" },
    { icon: BookOpen, label: isRTL ? "مراجع علمية حقيقية" : "Real Scientific References" },
    { icon: GraduationCap, label: isRTL ? "قوالب احترافية" : "Professional Templates" },
    { icon: Users, label: isRTL ? "Word & PowerPoint" : "Word & PowerPoint" },
  ];

  return (
    <Layout>
      <div className="grid lg:grid-cols-5 gap-8 items-start">
        <div className="lg:col-span-2 flex flex-col gap-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 mb-4">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-medium text-primary">
                {isRTL ? "مدعوم بالذكاء الاصطناعي" : "Powered by AI"}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-foreground leading-tight mb-3">
              {t("appName")}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              {t("appSubtitle")}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="grid grid-cols-2 gap-3"
          >
            {features.map(({ icon: Icon, label }, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-xs">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="lg:col-span-3">
          <motion.div
            initial={{ opacity: 0, x: isRTL ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border bg-card shadow-md overflow-hidden"
          >
            <div className="border-b px-6 py-4 bg-muted/30">
              <div className="flex items-center gap-4">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
                      i < step ? "bg-primary text-primary-foreground" :
                      i === step ? "bg-primary text-primary-foreground shadow-sm" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </div>
                    <span className={cn(
                      "text-xs font-medium hidden sm:block",
                      i === step ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {t(s)}
                    </span>
                    {i < STEPS.length - 1 && (
                      <div className={cn("h-px w-6 sm:w-12 transition-all", i < step ? "bg-primary" : "bg-border")} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="p-6">
                <AnimatePresence mode="wait">
                  {step === 0 && (
                    <motion.div
                      key="step0"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col gap-5"
                    >
                      <FormField control={form.control} name="topic" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("topic")}</FormLabel>
                          <FormControl>
                            <Input placeholder={t("topicPlaceholder")} data-testid="input-topic" {...field} className="h-11" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="flex flex-col gap-2">
                        <Label>{t("studentNames")}</Label>
                        {form.watch("studentNames").map((_, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Input
                              placeholder={`${t("studentPlaceholder")} ${idx + 1}`}
                              value={form.watch(`studentNames.${idx}`)}
                              onChange={(e) => {
                                const names = [...form.getValues("studentNames")];
                                names[idx] = e.target.value;
                                form.setValue("studentNames", names);
                              }}
                              data-testid={`input-student-${idx}`}
                              className="h-10"
                            />
                            {form.watch("studentNames").length > 1 && (
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeStudent(idx)} className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addStudent} className="w-fit gap-2 mt-1" data-testid="btn-add-student">
                          <Plus className="h-3.5 w-3.5" /> {t("addStudent")}
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={form.control} name="supervisorName" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("supervisorName")}</FormLabel>
                            <FormControl>
                              <Input placeholder={t("supervisorPlaceholder")} data-testid="input-supervisor" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="department" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("department")}</FormLabel>
                            <FormControl>
                              <Input placeholder={t("departmentPlaceholder")} data-testid="input-department" {...field} className="h-10" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label>{t("language")}</Label>
                        <div className="flex rounded-xl border bg-muted/50 p-1 gap-1">
                          {(["ar", "en"] as const).map((lang) => (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => form.setValue("language", lang)}
                              className={cn(
                                "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all",
                                form.watch("language") === lang
                                  ? "bg-card shadow text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                              data-testid={`btn-lang-${lang}`}
                            >
                              {lang === "ar" ? "العربية" : "English"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label>{t("documentType")}</Label>
                        <div className="grid grid-cols-2 gap-3">
                          {(["word", "pptx"] as const).map((type) => {
                            const isSelected = form.watch("documentType") === type;
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => {
                                  form.setValue("documentType", type);
                                  form.setValue("templateName", type === "word" ? "word_1" : "classic");
                                  form.setValue("pageCount", type === "word" ? 20 : 15);
                                }}
                                data-testid={`btn-doctype-${type}`}
                                className={cn(
                                  "flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 transition-all text-start",
                                  isSelected
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
                                )}
                              >
                                <div className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                )}>
                                  {type === "word"
                                    ? <FileText className="h-4 w-4" />
                                    : <Presentation className="h-4 w-4" />}
                                </div>
                                <div className="flex flex-col leading-tight">
                                  <span className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                    {t(type === "word" ? "documentTypeWord" : "documentTypePptx")}
                                  </span>
                                  <span className="text-xs text-muted-foreground/70">
                                    {t(type === "word" ? "documentTypeWordDesc" : "documentTypePptxDesc")}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label>{t("templateSelect")}</Label>
                        <div className={cn("grid gap-2", templates.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
                          {templates.map((tpl) => {
                            const isSelected = form.watch("templateName") === tpl.id;
                            return (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() => form.setValue("templateName", tpl.id)}
                                className={cn(
                                  "relative rounded-xl border-2 overflow-hidden transition-all text-start",
                                  isSelected ? "border-primary shadow-sm" : "border-border hover:border-primary/40"
                                )}
                              >
                                <div className={cn("h-12 w-full", tpl.color)} />
                                <div className="px-2.5 py-2">
                                  <span className={cn("text-xs font-semibold block", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                    {t(tpl.labelKey)}
                                  </span>
                                </div>
                                {isSelected && (
                                  <div className="absolute top-1.5 end-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Label>{t("pageCount")}</Label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => form.setValue("pageCount", Math.max(5, (form.getValues("pageCount") ?? 20) - 5))}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted hover:bg-muted/70 transition-colors"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border bg-muted/30 h-9 px-4">
                            <span className="font-bold text-foreground text-base tabular-nums">{form.watch("pageCount") ?? 20}</span>
                            <span className="text-xs text-muted-foreground">{pageUnit}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => form.setValue("pageCount", Math.min(300, (form.getValues("pageCount") ?? 20) + 5))}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted hover:bg-muted/70 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col gap-5"
                    >
                      <p className="text-sm text-muted-foreground">
                        {isRTL
                          ? "ارفع شعار جامعتك وكليتك لإضافتهما تلقائياً على غلاف المشروع (اختياري)"
                          : "Upload your university and faculty logos to automatically add them to the project cover (optional)"}
                      </p>
                      <LogoUpload
                        label={t("universityLogo")}
                        value={form.watch("universityLogoUrl")}
                        onChange={(url) => form.setValue("universityLogoUrl", url)}
                        data-testid="upload-university-logo"
                      />
                      <LogoUpload
                        label={t("facultyLogo")}
                        value={form.watch("facultyLogoUrl")}
                        onChange={(url) => form.setValue("facultyLogoUrl", url)}
                        data-testid="upload-faculty-logo"
                      />
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col gap-4"
                    >
                      <h3 className="font-semibold text-foreground">{t("review")}</h3>
                      <div className="rounded-xl border bg-muted/30 divide-y">
                        {[
                          { label: t("topic"), value: form.getValues("topic") },
                          { label: t("studentNames"), value: form.getValues("studentNames").filter(Boolean).join(" / ") },
                          { label: t("supervisorName"), value: form.getValues("supervisorName") },
                          { label: t("department"), value: form.getValues("department") },
                          { label: t("language"), value: form.getValues("language") === "ar" ? t("arabic") : t("english") },
                          { label: t("documentType"), value: form.getValues("documentType") === "word" ? t("documentTypeWord") : t("documentTypePptx") },
                          { label: t("templateSelect"), value: t(templates.find(t2 => t2.id === form.getValues("templateName"))?.labelKey ?? "templateWord1") },
                          { label: t("pageCount"), value: `${form.getValues("pageCount")} ${pageUnit}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="grid grid-cols-2 px-4 py-3 gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{label}</span>
                            <span className="text-xs text-foreground font-medium text-end">{value}</span>
                          </div>
                        ))}
                        {(form.getValues("universityLogoUrl") || form.getValues("facultyLogoUrl")) && (
                          <div className="flex gap-3 px-4 py-3">
                            {form.getValues("universityLogoUrl") && (
                              <img src={form.getValues("universityLogoUrl")!} className="h-10 w-10 object-contain rounded" alt="university" />
                            )}
                            {form.getValues("facultyLogoUrl") && (
                              <img src={form.getValues("facultyLogoUrl")!} className="h-10 w-10 object-contain rounded" alt="faculty" />
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className={cn("flex gap-3 mt-6", step > 0 ? "justify-between" : "justify-end")}>
                  {step > 0 && (
                    <Button type="button" variant="outline" onClick={prevStep} className="gap-2">
                      {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                      {t("back")}
                    </Button>
                  )}
                  {step < STEPS.length - 1 ? (
                    <Button type="button" onClick={nextStep} className="gap-2" data-testid="btn-next">
                      {t("next")}
                      {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  ) : (
                    <Button type="submit" className="gap-2" disabled={createProject.isPending} data-testid="btn-submit">
                      {createProject.isPending ? (
                        <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      ) : null}
                      {t("startGeneration")}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
