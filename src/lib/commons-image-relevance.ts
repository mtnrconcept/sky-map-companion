const BLOCKED_PHOTO_TERMS = [
  "finder chart",
  "star chart",
  "constellation map",
  "sky map",
  "diagram",
  "schematic",
  "spectrum",
  "spectra",
  "spectrograph",
  "light curve",
  "logo",
  "icon",
  "illustration",
  "artist impression",
  "artist's impression",
  "simulation",
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactIdentifier(value: string): string {
  return normalize(value).replace(/\s+/g, "");
}

export function isAllowedCommonsAssetUrl(value: string, type: "image" | "page"): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (type === "image") return url.hostname === "upload.wikimedia.org";
    return url.hostname === "commons.wikimedia.org";
  } catch {
    return false;
  }
}

export function commonsPhotoMatchesObject(
  title: string,
  description: string,
  matchTerms: string[],
): boolean {
  if (matchTerms.length === 0) return false;

  const haystack = normalize(`${title} ${description}`);
  const compactHaystack = haystack.replace(/\s+/g, "");
  if (!haystack) return false;

  if (BLOCKED_PHOTO_TERMS.some((term) => haystack.includes(normalize(term)))) return false;

  return matchTerms.some((term) => {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return false;

    // Catalog identifiers are frequently written both as "NGC 6960" and "NGC6960".
    const compactTerm = compactIdentifier(term);
    if (/^(m|ngc|ic|c)\d+[a-z]?$/.test(compactTerm)) {
      return compactHaystack.includes(compactTerm);
    }

    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(haystack);
  });
}
