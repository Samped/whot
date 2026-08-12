/** Crockford base32 — no I, L, O, U (avoids 1/0 confusion when typed). */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SALT = 0x5f3a9c1;

function normalize(raw: string) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .replace(/I/g, "1")
    .replace(/L/g, "1")
    .replace(/O/g, "0");
}

/** Reversible obfuscated code for a table id (shown in URLs and UI). */
export function encodeTableCode(id: number) {
  if (!Number.isFinite(id) || id <= 0 || id > 0xffff_ffff) return "";
  let n = (id ^ SALT) >>> 0;
  let out = "";
  for (let i = 0; i < 6; i++) {
    out = ALPHABET[n % 32]! + out;
    n = Math.floor(n / 32);
  }
  return out;
}

export function decodeTableCode(raw: string) {
  const s = normalize(raw);
  if (!s) return 0;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  if (s.length !== 6) return 0;

  let n = 0;
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return 0;
    n = n * 32 + idx;
  }

  const id = (n ^ SALT) >>> 0;
  if (id <= 0 || id > 0xffff_ffff) return 0;
  if (encodeTableCode(id) !== s) return 0;
  return id;
}

export function tableCode(id: number) {
  return encodeTableCode(id) || String(id).padStart(4, "0");
}

export function parseTableCode(raw: string) {
  return decodeTableCode(raw);
}

export function tableHref(id: number) {
  const code = tableCode(id);
  return code ? `/?t=${code}` : "/";
}
