export type ImageKind = "community-logo" | "community-banner" | "post-image";
export type UploadedImage = {
  id: string;
  url: string;
  width: number;
  height: number;
};

const limits: Record<ImageKind, { edge: number; bytes: number }> = {
  "community-logo": { edge: 512, bytes: 128 * 1024 },
  "community-banner": { edge: 1600, bytes: 384 * 1024 },
  "post-image": { edge: 1600, bytes: 512 * 1024 },
};

/** Decode and re-encode a device image, discarding metadata and active content. */
export async function prepareImage(
  file: File,
  { kind }: { kind: ImageKind },
): Promise<Blob> {
  // Phone pickers report HEIC or an empty type; decoding below is the real
  // gate, and the canvas re-encode always produces the JPEG the server needs.
  if (file.type && !file.type.startsWith("image/"))
    throw Error("Choose a photo or image file.");
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw Error("Choose an image smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw Error(
        "That image could not be opened. Try another JPG, PNG, or WebP.",
      );
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 60_000_000
    )
      throw Error("That image is too large. Try one with fewer pixels.");
    const limit = limits[kind];
    let scale = Math.min(
      1,
      limit.edge / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw Error("Your browser cannot prepare images. Try another browser.");
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#f2f1ed";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.88, 0.76, 0.64, 0.5]) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob && blob.type === "image/jpeg" && blob.size <= limit.bytes)
          return blob;
      }
      scale *= 0.75;
    }
    throw Error(
      "We could not make that image small enough. Try a simpler image.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(
  blob: Blob,
  kind: ImageKind,
): Promise<UploadedImage> {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(
      "/api/creators/content/media?kind=" + encodeURIComponent(kind),
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
        signal: controller.signal,
      },
    );
    let value: any;
    try {
      value = await response.json();
    } catch {
      if (controller.signal.aborted) throw new Error("Upload timed out.");
      throw Error("Your image could not be uploaded. Please try again.");
    }
    if (!response.ok)
      throw Error(value.error || "Your image could not be uploaded.");
    if (
      !/^[a-f0-9]{64}$/.test(value.id) ||
      value.url !== "/api/creators/content/media/" + value.id
    )
      throw Error(
        "The image service returned an invalid response. Please try again.",
      );
    return value;
  } catch (error) {
    if (controller.signal.aborted)
      throw Error(
        "Your image upload took too long. Your selected image is still here; try again.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function safeMediaUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  if (/^\/api\/creators\/content\/media\/[a-f0-9]{64}$/.test(value))
    return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !/^[a-z0-9.-]+$/.test(host) ||
      !host.includes(".") ||
      /^\d+(\.\d+){3}$/.test(host) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)
    )
      return "";
    return url.href;
  } catch {
    return "";
  }
}
