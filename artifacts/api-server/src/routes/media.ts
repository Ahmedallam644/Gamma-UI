import { Router } from "express";
import { SearchPexelsImagesQueryParams, UploadImageToCloudinaryBody } from "@workspace/api-zod";

const router = Router();

router.get("/media/pexels-search", async (req, res) => {
  try {
    const params = SearchPexelsImagesQueryParams.parse(req.query);
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Pexels API key not configured" });

    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", params.query);
    url.searchParams.set("per_page", String(params.per_page ?? 5));
    url.searchParams.set("orientation", "landscape");

    const response = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });

    if (!response.ok) {
      const text = await response.text();
      req.log.error({ status: response.status, body: text }, "Pexels API error");
      return res.status(502).json({ error: "Pexels API error" });
    }

    const data = await response.json() as {
      photos: Array<{
        id: number;
        url: string;
        photographer: string;
        src: { medium: string; large: string; large2x: string };
      }>;
      total_results: number;
    };

    res.json({
      photos: data.photos.map((p) => ({
        id: p.id,
        url: p.url,
        photographer: p.photographer,
        src: { medium: p.src.medium, large: p.src.large2x || p.src.large },
      })),
      total_results: data.total_results,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/media/upload-image", async (req, res) => {
  try {
    const body = UploadImageToCloudinaryBody.parse(req.body);
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: "Cloudinary not configured" });
    }

    const timestamp = Math.round(Date.now() / 1000);
    const folder = body.folder ?? "nursing-projects";

    const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const crypto = await import("crypto");
    const signature = crypto.createHash("sha256").update(stringToSign).digest("hex");

    const formData = new FormData();
    formData.append("file", body.dataUri);
    formData.append("api_key", apiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("signature", signature);
    formData.append("folder", folder);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: formData }
    );

    if (!response.ok) {
      const text = await response.text();
      req.log.error({ status: response.status, body: text }, "Cloudinary upload error");
      return res.status(502).json({ error: "Upload failed" });
    }

    const data = await response.json() as { secure_url: string; public_id: string };
    res.json({ url: data.secure_url, publicId: data.public_id });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
