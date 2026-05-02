import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useGetProject, getGetProjectQueryKey, useSelectProjectImages } from "@workspace/api-client-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Layout, StatusBadge } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, ImageIcon, Loader2, Sparkles, ChevronRight } from "lucide-react";
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

function extractHeadings(content: string): string[] {
  const lines = content.split("\n");
  const headings: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) continue;

    let heading = "";

    if (/^#{1,3}\s+/.test(trimmed)) {
      heading = trimmed.replace(/^#+\s*/, "").replace(/\*+/g, "").trim();
    } else if (
      /^(الفصل|المقدمة|الخاتمة|التوصيات|الأهداف|الإطار|المراجع|ملخص|الأساليب|الطرق|النتائج|المناقشة)/i.test(trimmed) &&
      trimmed.length < 80
    ) {
      heading = trimmed.replace(/^\*+|\*+$/g, "").trim();
    } else if (
      /^(Chapter|Introduction|Conclusion|Recommendations|Objectives|Framework|References|Summary|Methods|Results|Discussion)/i.test(trimmed) &&
      trimmed.length < 80
    ) {
      heading = trimmed.replace(/^\*+|\*+$/g, "").trim();
    }

    if (heading && !seen.has(heading)) {
      seen.add(heading);
      headings.push(heading);
    }

    if (headings.length >= 5) break;
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

  const [streamedSentences, setStreamedSentences] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamDone, setStreamDone] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Record<string, string>>({});
  const [hasStarted, setHasStarted] = useState(false);
  const bufferRef = useRef("");
  const endRef = useRef<HTMLDivElement>(null);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: project } = useGetProject(id!, {
    query: {
      enabled: !!id,
      queryKey: getGetProjectQueryKey(id!),
      refetchInterval: streamDone ? 5000 : false,
    },
  });

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
      if (project.status === "draft") {
        startStream();
      } else if (["images_pending", "payment_pending", "pending_approval", "completed"].includes(project.status)) {
        setStreamDone(true);
        if (project.generatedContent) {
          setStreamedSentences(splitIntoSentences(project.generatedContent));
        }
      }
    }
  }, [project, hasStarted, startStream]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamedSentences]);

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
