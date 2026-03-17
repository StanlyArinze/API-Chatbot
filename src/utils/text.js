import { Buffer } from "node:buffer";

function countSuspiciousEncodingMarks(value) {
  return (value.match(/Ã.|Â.|�/g) || []).length;
}

function tryLatin1ToUtf8(value) {
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

export function normalizeText(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  const suspiciousMarks = countSuspiciousEncodingMarks(trimmed);

  if (suspiciousMarks === 0) {
    return trimmed;
  }

  const repaired = tryLatin1ToUtf8(trimmed);

  if (countSuspiciousEncodingMarks(repaired) < suspiciousMarks) {
    return repaired.trim();
  }

  return trimmed;
}

export function normalizeObjectStrings(input) {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeObjectStrings(item));
  }

  if (!input || typeof input !== "object") {
    return normalizeText(input);
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, normalizeObjectStrings(value)])
  );
}

const BUSINESS_ABBREVIATIONS = [
  { pattern: /\bcx\b/gi, replacement: "caixas" },
  { pattern: /\bcxs\b/gi, replacement: "caixas" },
  { pattern: /\bct\b/gi, replacement: "caixas" },
  { pattern: /\bun\b/gi, replacement: "unidades" },
  { pattern: /\bund\b/gi, replacement: "unidades" },
  { pattern: /\buns\b/gi, replacement: "unidades" },
  { pattern: /\bpct\b/gi, replacement: "pacotes" },
  { pattern: /\bpcts\b/gi, replacement: "pacotes" },
  { pattern: /\bpc\b/gi, replacement: "pecas" },
  { pattern: /\bpcs\b/gi, replacement: "pecas" },
  { pattern: /\bpç\b/gi, replacement: "peca" },
  { pattern: /\bpçs\b/gi, replacement: "pecas" },
  { pattern: /\bkit\b/gi, replacement: "kit" },
  { pattern: /\bqtd\b/gi, replacement: "quantidade" },
  { pattern: /\baprox\b/gi, replacement: "aproximadamente" },
  { pattern: /\burg\b/gi, replacement: "urgente" },
  { pattern: /\bnp\b/gi, replacement: "novo hamburgo" },
  { pattern: /\bpoa\b/gi, replacement: "porto alegre" },
  { pattern: /\bcnpj\b/gi, replacement: "cnpj" }
];

export function expandBusinessAbbreviations(value) {
  const normalized = normalizeText(value);

  if (typeof normalized !== "string" || !normalized) {
    return normalized;
  }

  return BUSINESS_ABBREVIATIONS.reduce(
    (currentText, rule) => currentText.replace(rule.pattern, rule.replacement),
    normalized
  );
}
