import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useGetProject, getGetProjectQueryKey, useUploadPaymentReceipt, useUploadImageToCloudinary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, CheckCircle2, Receipt, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isRTL = i18n.language === "ar";

  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: project } = useGetProject(id!, {
    query: { enabled: !!id, queryKey: getGetProjectQueryKey(id!) },
  });

  const uploadImageMutation = useUploadImageToCloudinary();
  const uploadReceiptMutation = useUploadPaymentReceipt();

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUri = e.target?.result as string;
      setReceiptPreview(dataUri);
      try {
        const result = await uploadImageMutation.mutateAsync({
          data: { dataUri, folder: "nursing-receipts" },
        });
        setUploadedUrl(result.url);
      } catch {
        toast({ title: t("errorOccurred"), variant: "destructive" });
        setReceiptPreview(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const submitReceipt = async () => {
    if (!uploadedUrl || !id) return;
    try {
      await uploadReceiptMutation.mutateAsync({ id, data: { receiptUrl: uploadedUrl } });
      queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
      setLocation(`/status/${id}`);
    } catch {
      toast({ title: t("errorOccurred"), variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-center mb-8">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Receipt className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">{t("paymentTitle")}</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">{t("paymentDesc")}</p>
          </div>

          {project && (
            <div className="rounded-xl border bg-muted/30 p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("topic")}</p>
                  <p className="text-sm font-semibold text-foreground truncate">{project.topic}</p>
                </div>
              </div>
            </div>
          )}

          <div
            className={cn(
              "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all cursor-pointer min-h-48",
              isDragging ? "border-primary bg-primary/5 scale-[1.02]" : uploadedUrl ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10" : "border-border hover:border-primary/60 hover:bg-primary/5"
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            data-testid="upload-receipt-zone"
          >
            {uploadImageMutation.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">{t("receiptUploading")}</span>
              </div>
            ) : receiptPreview && uploadedUrl ? (
              <div className="flex flex-col items-center gap-3 p-4">
                <img src={receiptPreview} alt="receipt" className="max-h-36 rounded-lg object-contain shadow-sm" />
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {isRTL ? "تم الرفع بنجاح" : "Uploaded successfully"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{t("uploadReceipt")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("receiptHelper")}</p>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {uploadedUrl && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
              <Button
                className="w-full h-12 text-base"
                onClick={submitReceipt}
                disabled={uploadReceiptMutation.isPending}
                data-testid="btn-submit-receipt"
              >
                {uploadReceiptMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin me-2" />
                  : null}
                {t("submitReceipt")}
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </Layout>
  );
}
