// ═══════════════════════════════════════════════════════
//  pANEL — Key Verification API  (Vercel Serverless)
//  Route: GET  /api/verify?key=XXXX&hwid=YYYY
//
//  Required Vercel environment variables:
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY
// ═══════════════════════════════════════════════════════

const admin = require("firebase-admin");

// ── Firebase Admin init (singleton across warm invocations) ──
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel stores newlines as \n — restore them
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

// ── CORS helper ───────────────────────────────────────────────
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
}

// ── Handler ───────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCors(res);

  // Pre-flight
  if (req.method === "OPTIONS") return res.status(200).end();

  // Support both GET query-params and POST JSON body
  const key  = req.query.key  ?? req.body?.key  ?? null;
  const hwid = req.query.hwid ?? req.body?.hwid ?? null;

  // ── Validate input ─────────────────────────────────────────
  if (!key || typeof key !== "string" || key.trim() === "") {
    return res.status(400).json({
      valid: false,
      error: "Missing required parameter: key",
    });
  }

  const cleanKey = key.trim().toUpperCase();

  try {
    const keyRef  = db.collection("license_keys").doc(cleanKey);
    const keySnap = await keyRef.get();

    // ── Key not found ──────────────────────────────────────
    if (!keySnap.exists) {
      return res.json({ valid: false, error: "Key not found" });
    }

    const data = keySnap.data();

    // ── Revoked ────────────────────────────────────────────
    if (data.status === "revoked") {
      return res.json({ valid: false, error: "Key has been revoked" });
    }

    // ── Expiry check ───────────────────────────────────────
    let expiresAt = null;
    let daysLeft  = null;

    if (data.expiresAt) {
      expiresAt = data.expiresAt.toDate
        ? data.expiresAt.toDate()
        : new Date(data.expiresAt);

      if (expiresAt < new Date()) {
        // Auto-mark as expired in Firestore
        await keyRef.update({ status: "expired" });
        return res.json({
          valid:     false,
          error:     "Key has expired",
          expiredAt: expiresAt.toISOString(),
        });
      }

      daysLeft = Math.max(
        0,
        Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))
      );
    }

    // ── HWID binding ───────────────────────────────────────
    const storedHwid = data.hwid ?? null;

    if (storedHwid) {
      // Key already bound — verify it matches
      if (hwid && hwid !== storedHwid) {
        return res.json({
          valid: false,
          error: "HWID mismatch — key is locked to a different device",
        });
      }
    } else if (hwid) {
      // First use — bind HWID
      await keyRef.update({
        hwid,
        status:      "active",
        firstUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // ── Success ────────────────────────────────────────────
    return res.json({
      valid:     true,
      key:       cleanKey,
      type:      data.type    ?? "unknown",
      status:    data.status  ?? "active",
      hwid:      storedHwid ?? hwid ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      daysLeft,
      createdBy: data.createdBy ?? null,
      message:   `Key is valid${daysLeft !== null ? ` · ${daysLeft} day(s) remaining` : ""}`,
    });

  } catch (err) {
    console.error("[pANEL] verify error:", err);
    return res.status(500).json({
      valid: false,
      error: "Internal server error — please try again",
    });
  }
};
