export function isSafeProfileImageSrc(value?: string | null): value is string {
  if (!value) return false;
  const src = value.trim();
  return /^https?:\/\//i.test(src) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src);
}
