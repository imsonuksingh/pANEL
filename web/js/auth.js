// ═══════════════════════════════════════════════════════
//  pANEL — Authentication (Login page)
//  Validates selected role against Firestore user record
// ═══════════════════════════════════════════════════════

import { auth, db }               from "./firebase-config.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc }            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { toVirtualEmail, toPaddedPw } from "./utils.js";

const ROLE_LABEL = {
  owner:     'Owner',
  admin:     'Admin',
  master:    'Master',
  seller:    'Seller',
  developer: 'Developer',
};

// ── Redirect if already logged in ──────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const data = await getUserData(user.uid);
    if (data && data.active !== false) window.location.href = "dashboard.html";
  }
});

// ── Login form submit ───────────────────────────────────
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const selectedRole = window.__selectedRole;
  if (!selectedRole) return;

  const rawUsername = document.getElementById("loginUsername").value.trim();
  const rawPassword = document.getElementById("loginPassword").value;
  const btn         = document.getElementById("loginBtn");
  const status      = document.getElementById("loginStatus");

  if (!rawUsername) {
    setStatus(status, "❌  Please enter your username.", "error"); return;
  }
  if (!rawPassword) {
    setStatus(status, "❌  Please enter your password.", "error"); return;
  }

  const email    = toVirtualEmail(rawUsername);
  const password = toPaddedPw(rawPassword);

  setStatus(status, "", "");
  setLoading(btn, true);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uid  = cred.user.uid;

    // Fetch Firestore user record
    const userData = await getUserData(uid);

    if (!userData) {
      await signOut(auth);
      setStatus(status, "❌  Account not found in the system. Contact your admin.", "error");
      setLoading(btn, false);
      return;
    }

    if (userData.active === false) {
      await signOut(auth);
      setStatus(status, "⛔  Your account has been disabled. Contact your admin.", "error");
      setLoading(btn, false);
      return;
    }

    // ── ROLE MISMATCH CHECK ─────────────────────────────
    if (userData.role !== selectedRole) {
      await signOut(auth);
      const actual  = ROLE_LABEL[userData.role]  || userData.role;
      const chosen  = ROLE_LABEL[selectedRole]   || selectedRole;
      setStatus(
        status,
        `🚫  You selected "${chosen}" but your account role is "${actual}". Please go back and pick the correct role.`,
        "error"
      );
      setLoading(btn, false);
      return;
    }
    // ────────────────────────────────────────────────────

    setStatus(status, `✅  Welcome, ${userData.name || rawUsername}! Redirecting…`, "success");
    setTimeout(() => { window.location.href = "dashboard.html"; }, 900);

  } catch (err) {
    setLoading(btn, false);
    setStatus(status, getAuthError(err.code), "error");
  }
});

// ── Helpers ─────────────────────────────────────────────
async function getUserData(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

function setLoading(btn, on) {
  btn.querySelector(".btn-text").style.display   = on ? "none"  : "flex";
  btn.querySelector(".btn-loader").style.display = on ? "inline": "none";
  btn.disabled = on;
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className   = "auth-status " + type;
}

function getAuthError(code) {
  const map = {
    "auth/user-not-found":         "❌  No account found with this username.",
    "auth/wrong-password":         "❌  Incorrect password. Try again.",
    "auth/invalid-credential":     "❌  Invalid username or password.",
    "auth/too-many-requests":      "⚠️  Too many failed attempts. Try again later.",
    "auth/user-disabled":          "⛔  This account has been disabled.",
    "auth/network-request-failed": "❗  No internet connection.",
    "auth/invalid-email":          "❌  Invalid username format.",
  };
  return map[code] || `❌  Authentication error: ${code}`;
}
