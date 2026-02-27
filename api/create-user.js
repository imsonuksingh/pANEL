// ═══════════════════════════════════════════════════════
//  pANEL — Create User API  (Vercel Serverless)
//  Route: POST /api/create-user
//
//  Body: { name, username, password, role, wallet, callerToken }
//  callerToken = Firebase ID token of the logged-in owner/admin/master
// ═══════════════════════════════════════════════════════

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db   = admin.firestore();
const rtdb = admin.database();
const auth = admin.auth();

const ROLE_RANK = { owner: 4, admin: 3, master: 2, seller: 1 };
const PW_SALT   = "||pANEL";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");
}

function toVirtualEmail(username) {
  const clean = username.trim().toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._\-]/g, "") || "user";
  return clean + "@panel.app";
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { name, username, password, role, wallet = 0, callerToken } = req.body || {};

  // ── Input validation ───────────────────────────────────
  if (!name || !username || !password || !role || !callerToken) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // ── Verify caller's identity ───────────────────────────
  let callerUid;
  try {
    const decoded = await auth.verifyIdToken(callerToken);
    callerUid = decoded.uid;
  } catch {
    return res.status(401).json({ error: "Unauthorized — invalid token." });
  }

  // ── Fetch caller's Firestore doc ───────────────────────
  const callerSnap = await db.collection("users").doc(callerUid).get();
  if (!callerSnap.exists || callerSnap.data().active === false) {
    return res.status(403).json({ error: "Your account is inactive or not found." });
  }

  const callerRole = callerSnap.data().role;
  const callerRank = ROLE_RANK[callerRole] ?? 0;
  const targetRank = ROLE_RANK[role]       ?? 0;

  // ── Permission check: caller must outrank target ───────
  if (callerRank <= targetRank) {
    return res.status(403).json({
      error: `A "${callerRole}" cannot create a "${role}" account.`
    });
  }

  const email    = toVirtualEmail(username);
  const paddedPw = password + PW_SALT;

  // ── Create Firebase Auth user ──────────────────────────
  let newUid;
  try {
    const userRecord = await auth.createUser({ email, password: paddedPw });
    newUid = userRecord.uid;
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      return res.status(409).json({ error: `Username "${username}" is already taken.` });
    }
    return res.status(500).json({ error: err.message });
  }

  // ── Write Firestore doc ────────────────────────────────
  try {
    await db.collection("users").doc(newUid).set({
      name,
      username,
      email,
      role,
      wallet: Number(wallet),
      active:    true,
      createdBy: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── Set Realtime DB wallet ─────────────────────────
    await rtdb.ref(`wallets/${newUid}`).set(Number(wallet));

    return res.json({
      success: true,
      uid:     newUid,
      message: `User "${name}" created as ${role}.`,
    });

  } catch (err) {
    // Clean up Auth user if Firestore write failed
    await auth.deleteUser(newUid).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
};
