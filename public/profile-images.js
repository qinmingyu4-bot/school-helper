(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeProfileImages = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  const maxSourceBytes = 25 * 1024 * 1024;
  const limits = Object.freeze({ avatar: { side: 512, bytes: 80 * 1024 }, cover: { side: 1600, bytes: 128 * 1024 } });

  function dimensions(width, height, side) {
    if (!(width > 0 && height > 0) || width * height > 80000000) throw new Error("照片尺寸过大或无法读取，请在相册缩小后重试。");
    const scale = Math.min(1, side / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  async function prepareImage(file, kind = "avatar", environment = globalThis) {
    if (!file || !file.size) throw new Error("图片为空，请重新选择照片。");
    if (!String(file.type || "").startsWith("image/") && !/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name || "")) throw new Error("请选择照片文件，例如 JPG、PNG 或 WebP。");
    if (file.size > maxSourceBytes) throw new Error("原图超过 25 MB，请先在相册缩小或导出为 JPG 后重试。");
    const limit = limits[kind];
    if (!limit) throw new Error("未知的资料图片类型。");
    const url = environment.URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const picture = new environment.Image();
        picture.onload = () => resolve(picture);
        picture.onerror = () => reject(new Error("图片无法读取。若是 HEIC/HEIF 照片，请在相册导出为 JPG 或 PNG 后重试。"));
        picture.src = url;
      });
      const size = dimensions(image.naturalWidth, image.naturalHeight, limit.side);
      const canvas = environment.document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法处理照片，请更新浏览器或更换照片。");
      for (let attempt = 0; attempt < 7; attempt++) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.88, 0.74, 0.6]) {
          const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("照片压缩失败，请换一张照片重试。")), "image/jpeg", quality));
          if (blob.size <= limit.bytes) return await new Promise((resolve, reject) => {
            const reader = new environment.FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("照片读取失败，请重试。"));
            reader.onabort = () => reject(new Error("照片处理已取消，请重试。"));
            reader.readAsDataURL(blob);
          });
        }
        canvas.width = Math.max(1, Math.floor(canvas.width * 0.75));
        canvas.height = Math.max(1, Math.floor(canvas.height * 0.75));
      }
      throw new Error("照片压缩后仍然过大，请裁剪照片后重试。");
    } finally {
      environment.URL.revokeObjectURL(url);
    }
  }

  async function readInput(input, existingValue = "", kind = "avatar", environment = globalThis) {
    const file = input?.files?.[0];
    return file ? prepareImage(file, kind, environment) : existingValue || "";
  }

  return { maxSourceBytes, limits, dimensions, prepareImage, readInput };
});
