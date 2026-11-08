/** Local, auth-gated stills only. A missing frame stays missing. */

export function previewFor(manifest, adId) {
  if (!manifest || manifest.coverage === "pending") return null;
  const item = manifest.ads?.[adId];
  if (!item || item.coverage !== "ready") return null;
  const file = item.file;
  if (typeof file !== "string" || !/^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp)$/i.test(file)) return null;
  return { src: `/data/previews/${file}`, alt: item.alt || "" };
}
