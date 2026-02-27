// ═══════════════════════════════════════════════════════
//  pANEL — Firebase Configuration
//  Replace the values below with YOUR Firebase project config
//  Firebase Console → Project Settings → General → Your Apps
// ═══════════════════════════════════════════════════════

import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─── FIREBASE CONFIG ────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDxlzStE59vAflvPJJVrdQctnYozfzV7Rk",
  authDomain:        "tejassxnget.vercel.app",
  databaseURL:       "https://panel-app-b5ca4-default-rtdb.firebaseio.com",
  projectId:         "panel-app-b5ca4",
  storageBucket:     "panel-app-b5ca4.firebasestorage.app",
  messagingSenderId: "788026223999",
  appId:             "1:788026223999:web:427be4da40baf8b4d53e4a"
};
// ────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);   // Firestore (user data, keys)
export const rtdb = getDatabase(app);    // Realtime DB (live wallet balance)
