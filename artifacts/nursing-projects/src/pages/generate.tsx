import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useGetProject, getGetProjectQueryKey, useSelectProjectImages } from "@workspace/api-client-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Layout, StatusBadge } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, ImageIcon, Loader2, Sparkles, ChevronRight, ListChecks, ClipboardPaste, Wand2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PexelsPhoto {
  id: number;
  url: string;
  photographer: string;
  src: { medium: string; large: string };
}

interface PexelsResult {
  photos: PexelsPhoto[];
  total_results: number;
}

const AR_HEAD = /^(الفصل|المقدمة|الخاتمة|التوصيات|الأهداف|الإطار|المراجع|ملخص|الأساليب|الطرق|النتائج|المناقشة|أهمية|خلفية)/i;
const EN_HEAD = /^(Chapter|Introduction|Conclusion|Recommendations|Objectives|Framework|References|Summary|Abstract|Methods|Results|Discussion|Importance|Background)/i;

function extractHeadings(content: string): string[] {
  const headings: string[] = [];
  const seen = new Set<string>();

  const addHeading = (raw: string) => {
    const h = raw.replace(/\*+/g, "").replace(/:+$/, "").trim();
    if (h && h.length < 100 && !seen.has(h)) {
      seen.add(h);
      headings.push(h);
    }
  };

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^#{1,3}\s+/.test(trimmed)) {
      addHeading(trimmed.replace(/^#+\s*/, ""));
    } else {
      const boldMatch = trimmed.match(/^\*\*([^*]{2,80})\*\*:?/);
      if (boldMatch) {
        const inner = boldMatch[1].trim();
        if (AR_HEAD.test(inner) || EN_HEAD.test(inner)) addHeading(inner);
      } else if ((AR_HEAD.test(trimmed) || EN_HEAD.test(trimmed)) && trimmed.length < 90) {
        addHeading(trimmed);
      }
    }

    if (headings.length >= 6) break;
  }

  if (headings.length === 0) {
    for (const m of content.matchAll(/\*\*([^*\n]{3,80})\*\*:?/g)) {
      const inner = m[1].trim();
      if ((AR_HEAD.test(inner) || EN_HEAD.test(inner)) && inner.length < 80) {
        addHeading(inner);
      }
      if (headings.length >= 6) break;
    }
  }

  return headings;
}

async function fetchPexelsSection(query: string, base: string): Promise<PexelsResult> {
  const url = `${base}/api/media/pexels-search?query=${encodeURIComponent(query)}&per_page=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Pexels error");
  return res.json() as Promise<PexelsResult>;
}

export default function GeneratePage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isRTL = i18n.language === "ar";

  // Content generation state
  const [streamedSentences, setStreamedSentences] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamDone, setStreamDone] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Record<string, string>>({});
  const [hasStarted, setHasStarted] = useState(false);
  const bufferRef = useRef("");
  const endRef = useRef<HTMLDivElement>(null);

  // Outline step state
  const [outlineMode, setOutlineMode] = useState<"ai" | "paste">("ai");
  const [outlineText, setOutlineText] = useState("");
  const [isStreamingOutline, setIsStreamingOutline] = useState(false);
  const [outlineStreamDone, setOutlineStreamDone] = useState(false);
  const [hasStartedOutline, setHasStartedOutline] = useState(false);
  const [approvingOutline, setApprovingOutline] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: project } = useGetProject(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetProjectQueryKey(id!),
      refetchInterval: streamDone ? 5000 : false,
    },
  });

  // Derived: is this project in the "outline needed" state?
  const projectOutline = (project as (typeof project & { outline?: string | null }))?.outline;
  const needsOutline = project?.status === "draft" && !projectOutline;
  const outlineApproved = project?.status === "draft" && !!projectOutline;

  const content = project?.generatedContent ?? "";
  const headings = streamDone && content ? extractHeadings(content) : [];

  const sectionQueries = useQueries({
    queries: headings.map((heading) => ({
      queryKey: ["pexels-section", heading],
      queryFn: () => fetchPexelsSection(heading, base),
      enabled: streamDone && headings.length > 0,
      staleTime: Infinity,
    })),
  });

  const selectImagesMutation = useSelectProjectImages();

  const splitIntoSentences = (text: string): string[] => {
    return text.split(/(?<=[.!?؟\n])\s+/).filter(Boolean);
  };

  // ── Outline streaming ────────────────────────────────────────────────────
  const streamOutline = useCallback(async () => {
    if (hasStartedOutline || !id) return;
    setHasStartedOutline(true);
    setIsStreamingOutline(true);
    let text = "";

    try {
      const response = await fetch(`${base}/api/projects/${id}/generate-outline`, { method: "POST" });
      if (!response.body) throw new Error("No stream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rawBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawBuffer += decoder.decode(value, { stream: true });
        const lines = rawBuffer.split("\n");
        rawBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if (parsed.done) {
              setOutlineStreamDone(true);
              setIsStreamingOutline(false);
              break;
            }
            if (parsed.error) {
              toast({ title: t("errorOccurred"), description: parsed.error, variant: "destructive" });
              setIsStreamingOutline(false);
              break;
            }
            if (parsed.text) {
              text += parsed.text;
              setOutlineText(text);
            }
          } catch {}
        }
      }
      setOutlineStreamDone(true);
      setIsStreamingOutline(false);
    } catch {
      setIsStreamingOutline(false);
      toast({ title: t("errorOccurred"), variant: "destructive" });
    }
  }, [id, hasStartedOutline, base, t, toast]);

  const approveOutline = async () => {
    if (!id || !outlineText.trim()) return;
    setApprovingOutline(true);
    try {
      await fetch(`${base}/api/projects/${id}/save-outline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline: outlineText }),
      });
      await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      // Immediately start content generation
      startStream();
    } catch {
      toast({ title: t("errorOccurred"), variant: "destructive" });
    } finally {
      setApprovingOutline(false);
    }
  };

  // ── Content streaming ────────────────────────────────────────────────────
  const startStream = useCallback(async () => {
    if (hasStarted || !id) return;
    setHasStarted(true);
    setIsStreaming(true);
    bufferRef.current = "";

    try {
      const response = await fetch(`${base}/api/projects/${id}/generate`, { method: "POST" });
      if (!response.body) throw new Error("No stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let rawBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        rawBuffer += decoder.decode(value, { stream: true });
        const lines = rawBuffer.split("\n");
        rawBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          try {
            const parsed = JSON.parse(data);
            if (parsed.done) {
              setStreamDone(true);
              setIsStreaming(false);
              queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
              break;
            }
            if (parsed.error) {
              toast({ title: t("errorOccurred"), description: parsed.error, variant: "destructive" });
              setIsStreaming(false);
              break;
            }
            if (parsed.text) {
              bufferRef.current += parsed.text;
              const sentences = splitIntoSentences(bufferRef.current);
              if (sentences.length > 1) {
                const complete = sentences.slice(0, -1);
                bufferRef.current = sentences[sentences.length - 1];
                setStreamedSentences((prev) => [...prev, ...complete]);
              }
            }
          } catch {}
        }
      }
      if (bufferRef.current.trim()) {
        setStreamedSentences((prev) => [...prev, bufferRef.current.trim()]);
        bufferRef.current = "";
      }
      setStreamDone(true);
      setIsStreaming(false);
    } catch {
      setIsStreaming(false);
      toast({ title: t("errorOccurred"), variant: "destructive" });
    }
  }, [id, hasStarted, t, toast, queryClient, base]);

  useEffect(() => {
    if (project && !hasStarted) {
      if (project.status === "draft" && outlineApproved) {
        // Outline already saved (e.g., user refreshed) — go straight to content
        startStream();
      } else if (["images_pending", "payment_pending", "pending_approval", "completed"].includes(project.status)) {
        setStreamDone(true);
        if (project.generatedContent) {
          setStreamedSentences(splitIntoSentences(project.generatedContent));
        }
      }
    }
  }, [project, hasStarted, startStream, outlineApproved]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamedSentences, outlineText]);

  const toggleImage = (sectionKey: string, url: string) => {
    setSelectedImages((prev) => {
      if (prev[sectionKey] === url) {
        const next = { ...prev };
        delete next[sectionKey];
        return next;
      }
      return { ...prev, [sectionKey]: url };
    });
  };

  const selectedCount = Object.keys(selectedImages).length;
  const allUrls = Object.values(selectedImages);

  const confirmImages = async () => {
    if (!allUrls.length || !id) return;
    try {
      await selectImagesMutation.mutateAsync({ id, data: { imageUrls: allUrls } });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      setLocation(`/payment/${id}`);
    } catch {
      toast({ title: t("errorOccurred"), variant: "destructive" });
    }
  };

  const allSectionsLoaded = sectionQueries.length > 0 && sectionQueries.every((q) => !q.isLoading);
  const anySectionLoading = sectionQueries.some((q) => q.isLoading);

  // ── Outline step UI ──────────────────────────────────────────────────────
  if (needsOutline) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ListChecks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground">
                {isRTL ? "مخطط البحث" : "Research Outline"}
              </h1>
              {project && <p className="text-sm text-muted-foreground truncate max-w-xs">{project.topic}</p>}
            </div>
            {project && <div className="ms-auto"><StatusBadge status={project.status} /></div>}
          </div>

          <p className="text-sm text-muted-foreground mb-5">
            {isRTL
              ? "قبل توليد المحتوى الكامل، راجع المخطط وعدّله أو الصق مخططك الخاص — هذا يضمن أن النتائج تطابق ما تريد بالضبط."
              : "Before generating the full content, review the outline and edit it or paste your own — this ensures the output matches exactly what you need."}
          </p>

          {/* Mode tabs */}
          <div className="flex rounded-xl border bg-muted/50 p-1 gap-1 mb-5 w-fit">
            <button
              type="button"
              onClick={() => setOutlineMode("ai")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                outlineMode === "ai" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {isRTL ? "توليد بالذكاء الاصطناعي" : "Generate with AI"}
            </button>
            <button
              type="button"
              onClick={() => setOutlineMode("paste")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                outlineMode === "paste" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              {isRTL ? "الصق مخططك الخاص" : "Paste your own"}
            </button>
          </div>

          {/* AI mode */}
          {outlineMode === "ai" && (
            <div className="flex flex-col gap-4">
              {!hasStartedOutline && (
                <Button onClick={streamOutline} className="w-fit gap-2">
                  <Sparkles className="h-4 w-4" />
                  {isRTL ? "إنشاء مخطط بالذكاء الاصطناعي" : "Generate Outline with AI"}
                </Button>
              )}

              {(isStreamingOutline || outlineText) && (
                <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                  <div className="border-b px-5 py-3 bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-400/70" />
                      <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
                      <div className="h-3 w-3 rounded-full bg-green-400/70" />
                      <span className="text-xs text-muted-foreground ms-2">
                        {isRTL ? "مخطط البحث" : "Research Outline"}
                      </span>
                    </div>
                    {outlineStreamDone && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isRTL ? "اكتمل" : "Done"}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={outlineText}
                    onChange={(e) => setOutlineText(e.target.value)}
                    disabled={isStreamingOutline}
                    dir={isRTL ? "rtl" : "ltr"}
                    className={cn(
                      "w-full p-5 min-h-72 text-sm leading-relaxed bg-transparent resize-none outline-none",
                      isRTL ? "font-['Amiri',serif] text-base" : "font-mono",
                      isStreamingOutline && "opacity-80"
                    )}
                    placeholder={isRTL ? "جاري إنشاء المخطط..." : "Generating outline..."}
                  />
                  {isStreamingOutline && (
                    <div className="px-5 pb-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {isRTL ? "جاري التوليد..." : "Generating..."}
                    </div>
                  )}
                </div>
              )}

              {outlineStreamDone && outlineText && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-xl border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 px-4 py-3">
                  <Pencil className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  {isRTL
                    ? "يمكنك تعديل المخطط مباشرة في الحقل أعلاه قبل الموافقة"
                    : "You can edit the outline directly in the field above before approving"}
                </div>
              )}
            </div>
          )}

          {/* Paste mode */}
          {outlineMode === "paste" && (
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="border-b px-5 py-3 bg-muted/30 flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-400/70" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
                <div className="h-3 w-3 rounded-full bg-green-400/70" />
                <span className="text-xs text-muted-foreground ms-2">
                  {isRTL ? "مخططك الخاص" : "Your Outline"}
                </span>
              </div>
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                dir={isRTL ? "rtl" : "ltr"}
                className={cn(
                  "w-full p-5 min-h-72 text-sm leading-relaxed bg-transparent resize-none outline-none",
                  isRTL ? "font-['Amiri',serif] text-base" : "font-mono"
                )}
                placeholder={
                  isRTL
                    ? "الصق أو اكتب مخطط البحث هنا...\nمثال:\n**المقدمة:**\n- تعريف الموضوع\n- أهمية البحث\n\n**الأهداف:**\n- هدف 1\n- هدف 2"
                    : "Paste or type your research outline here...\nExample:\n**Introduction:**\n- Topic definition\n- Research importance\n\n**Objectives:**\n- Objective 1\n- Objective 2"
                }
              />
            </div>
          )}

          {/* Approve button */}
          {outlineText.trim() && !isStreamingOutline && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end mt-4"
            >
              <Button
                onClick={approveOutline}
                disabled={approvingOutline}
                className="gap-2"
              >
                {approvingOutline ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {isRTL ? "اعتماد المخطط وبدء التوليد" : "Approve Outline & Generate Content"}
                <ChevronRight className={cn("h-4 w-4", isRTL && "rotate-180")} />
              </Button>
            </motion.div>
          )}
          <div ref={endRef} />
        </div>
      </Layout>
    );
  }

  // ── Content streaming + image selection UI ───────────────────────────────
  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              isStreaming ? "bg-primary/10" : streamDone ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted"
            )}>
              {isStreaming ? (
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              ) : streamDone ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              )}
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground">
                {isStreaming ? t("generatingContent") : streamDone ? t("generationComplete") : t("generatingContent")}
              </h1>
              {project && <p className="text-sm text-muted-foreground truncate max-w-xs">{project.topic}</p>}
            </div>
          </div>
          {project && <StatusBadge status={project.status} />}
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden mb-6">
          <div className="border-b px-5 py-3 bg-muted/30 flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-400/70" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
            <div className="h-3 w-3 rounded-full bg-green-400/70" />
            <span className="text-xs text-muted-foreground ms-2">
              {isRTL ? "محتوى المشروع" : "Project Content"}
            </span>
          </div>
          <div
            className={cn(
              "p-6 min-h-64 max-h-[50vh] overflow-y-auto text-sm leading-relaxed",
              isRTL ? "font-['Amiri',serif] text-base" : "font-sans"
            )}
            dir={isRTL ? "rtl" : "ltr"}
          >
            <AnimatePresence>
              {streamedSentences.map((sentence, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="inline"
                >
                  {sentence}{" "}
                </motion.span>
              ))}
            </AnimatePresence>
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-primary animate-pulse rounded-full align-middle ms-0.5" />
            )}
            <div ref={endRef} />
          </div>
        </div>

        <AnimatePresence>
          {streamDone && (
            <motion.div
              initial={{ opacity: 0, x: isRTL ? -40 : 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-foreground">
                  {t("selectImages")}
                </h2>
                {selectedCount > 0 && (
                  <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {selectedCount} {t("imagesSelected")}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                {t("imagesPerSection")}
              </p>

              {anySectionLoading && !allSectionsLoaded ? (
                <div className="flex items-center justify-center h-40 rounded-xl border bg-muted/30">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    <span className="text-sm text-muted-foreground">{t("searchingImages")}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {headings.map((heading, si) => {
                    const result = sectionQueries[si]?.data;
                    if (!result?.photos.length) return null;
                    const sectionKey = `section_${si}`;
                    return (
                      <motion.div
                        key={sectionKey}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: si * 0.1 }}
                      >
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="h-1 w-1 rounded-full bg-primary" />
                          <h3 className="text-sm font-semibold text-foreground truncate max-w-xs" dir={isRTL ? "rtl" : "ltr"}>
                            {heading.replace(/^#+\s*/, "")}
                          </h3>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {result.photos.map((photo) => {
                            const isSelected = selectedImages[sectionKey] === photo.src.large;
                            return (
                              <motion.div
                                key={photo.id}
                                whileHover={{ scale: 1.04 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => toggleImage(sectionKey, photo.src.large)}
                                className={cn(
                                  "relative aspect-[4/3] rounded-xl overflow-hidden cursor-pointer border-2 transition-all",
                                  isSelected
                                    ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.3)]"
                                    : "border-transparent hover:border-primary/40"
                                )}
                              >
                                <img src={photo.src.medium} alt={photo.photographer} className="w-full h-full object-cover" loading="lazy" />
                                <AnimatePresence>
                                  {isSelected && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.5 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.5 }}
                                      className="absolute inset-0 bg-primary/20 flex items-center justify-center"
                                    >
                                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary shadow-lg">
                                        <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}

                  {headings.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm rounded-xl border bg-muted/20">
                      {isRTL ? "لا توجد أقسام محددة في المحتوى" : "No sections detected in content"}
                    </div>
                  )}
                </div>
              )}

              {selectedCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end mt-6"
                >
                  <Button
                    onClick={confirmImages}
                    disabled={selectImagesMutation.isPending}
                    className="gap-2"
                    data-testid="btn-confirm-images"
                  >
                    {selectImagesMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : null}
                    {t("confirmImages")}
                    <ChevronRight className={cn("h-4 w-4", isRTL && "rotate-180")} />
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
