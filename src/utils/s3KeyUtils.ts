/**
 * Returns candidate S3 key strings for DB lookup.
 * S3 event notifications URL-encode keys (+ for spaces, % encoding, etc.).
 */
export function getS3KeyLookupVariants(rawKey: string): string[] {
  const variants = new Set<string>([rawKey]);

  const plusAsSpace = rawKey.replace(/\+/g, ' ');
  variants.add(plusAsSpace);

  try {
    variants.add(decodeURIComponent(rawKey));
  } catch {
    // ignore malformed percent-encoding
  }

  try {
    variants.add(decodeURIComponent(plusAsSpace));
  } catch {
    // ignore malformed percent-encoding
  }

  return [...variants];
}
