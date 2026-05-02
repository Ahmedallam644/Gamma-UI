import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUploadImageToCloudinary } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, X, Building2 } from "lucide-react";

interface LogoUploadProps {
  label: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  "data-testid"?: string;
}

export function LogoUpload({ label, value, onChange, "data-testid": testId }: LogoUploadProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadImageToCloudinary();

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUri = e.target?.result as string;
      try {
        const result = await uploadMutation.mutateAsync({ data: { dataUri, folder: "nursing-logos" } });
        onChange(result.url);
      } catch {
        onChange(null);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all cursor-pointer",
          "h-24 w-full hover:border-primary/60 hover:bg-primary/5",
          value ? "border-primary/40 bg-primary/5" : "border-border"
        )}
        onClick={() => fileRef.current?.click()}
        data-testid={testId}
      >
        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-1">
            <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs text-muted-foreground">{t("logoUploading")}</span>
          </div>
        ) : value ? (
          <div className="flex items-center gap-3 px-4">
            <img src={value} alt="logo" className="h-12 w-12 object-contain rounded" />
            <div className="flex flex-col gap-1">
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Uploaded</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={(e) => { e.stopPropagation(); onChange(null); }}
              >
                <X className="h-3 w-3 mr-1" /> {t("changeLogo")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">{t("uploadLogo")}</span>
            <span className="text-xs text-muted-foreground/60">PNG, JPG</span>
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
    </div>
  );
}
