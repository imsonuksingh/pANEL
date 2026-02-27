// ═══════════════════════════════════════════════════════
//  pANEL — Auth Utils
//  Username-based auth helpers shared across all pages
// ═══════════════════════════════════════════════════════

// Converts a display username to a valid Firebase Auth email
// e.g.  "JohnDoe_99"  →  "johndoe_99@panel.app"
//       "my panel"    →  "my.panel@panel.app"
export function toVirtualEmail(username) {
  const clean = username
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")         // spaces → dots
    .replace(/[^a-z0-9._\-]/g, "") // strip invalid email-local chars
    || "user";
  return clean + "@panel.app";
}

// Firebase requires min-6-char passwords.
// We transparently pad any password with a hidden salt so that
// short passwords (like "123") work seamlessly.
const PW_SALT = "||pANEL";
export function toPaddedPw(rawPassword) {
  return rawPassword + PW_SALT;
}
