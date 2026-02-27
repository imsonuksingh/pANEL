// ═══════════════════════════════════════════════════════
//  pANEL — Dashboard App (Main Logic)
//  Roles: owner > admin > master > seller
// ═══════════════════════════════════════════════════════

import { auth, db, rtdb }          from "./firebase-config.js";
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit,
  onSnapshot, getDocs, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, onValue, set, increment, update }
                                    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { toVirtualEmail, toPaddedPw } from "./utils.js";

// ── Global state ─────────────────────────────────────────
let currentUser  = null;   // Firebase Auth user
let currentData  = null;   // Firestore user document data
let allKeys      = [];     // cached keys for filter
let allUsers     = [];     // cached users for management
let activeRoleTab = "all"; // current users sub-tab

const ROLE_RANK = { owner: 4, admin: 3, master: 2, seller: 1 };
const ROLE_COLOR = { owner: "owner", admin: "admin", master: "master", seller: "seller" };
const KEY_COST   = { weekly: 700, monthly: 1600 };

// ══════════════════════════════════════════════════════════
//  AUTH GUARD — redirect to login if not authenticated
// ══════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }

  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().active === false) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  currentData = snap.data();
  initDashboard();
});

// ══════════════════════════════════════════════════════════
//  INIT DASHBOARD
// ══════════════════════════════════════════════════════════
function initDashboard() {
  const { name, role } = currentData;
  const initials = name ? name.charAt(0).toUpperCase() : "U";

  // Sidebar info
  document.getElementById("sidebarName").textContent    = name || "User";
  document.getElementById("sidebarRole").innerHTML      = roleBadge(role);
  document.getElementById("sidebarAvatar").textContent  = initials;
  document.getElementById("topUserName").textContent    = name || "User";
  document.getElementById("topbarAvatar").textContent   = initials;
  document.getElementById("welcomeMsg").textContent     = `Welcome back, ${name || "User"} 👋`;
  document.getElementById("welcomeDate").innerHTML      = `<div>${new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</div><div style="font-size:12px;color:var(--text-3)">${new Date().toLocaleDateString("en-IN",{year:"numeric"})}</div>`;

  // Profile page
  document.getElementById("profileName").textContent   = name || "—";
  document.getElementById("profileEmail").querySelector("#profileUsername").textContent
    = currentData.username || currentUser.email.replace("@panel.app", "");
  document.getElementById("profileAvatarLg").textContent = initials;
  document.getElementById("profileRoleBadge").innerHTML = roleBadge(role);

  // Hide nav items not allowed for this role
  applyRoleGating(role);

  // Live wallet via Realtime DB
  listenWallet(currentUser.uid);

  // Navigation
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  // Topbar title click map
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebarOverlay").classList.toggle("open");
  });
  document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
  document.getElementById("sidebarOverlay").addEventListener("click", closeSidebar);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  document.getElementById("openGenModal").addEventListener("click", () => openGenModal());
  document.getElementById("openAddUserModal")?.addEventListener("click", () => openAddUserModal());
  document.getElementById("changePwForm").addEventListener("submit", handlePwChange);

  // User sub-tabs
  document.querySelectorAll(".sub-tab").forEach(t => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".sub-tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      activeRoleTab = t.dataset.roleTab;
      renderUsers();
    });
  });

  // Select all keys checkbox
  document.getElementById("selectAllKeys").addEventListener("change", (e) => {
    document.querySelectorAll(".key-checkbox").forEach(cb => cb.checked = e.target.checked);
    updateBulkBar();
  });

  // Navigate to default page
  navigate("overview");
  loadOverviewStats();
  listenKeys();
}

// ══════════════════════════════════════════════════════════
//  NAV
// ══════════════════════════════════════════════════════════
window.navigate = function(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));

  const pageEl = document.getElementById("page-" + page);
  if (pageEl) pageEl.classList.add("active");

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add("active");

  const titles = { overview:"Overview", keys:"License Keys", users:"User Management", wallets:"Wallet Manager", profile:"Profile" };
  document.getElementById("topbarTitle").textContent = titles[page] || "pANEL";

  // Lazy load page data
  if (page === "users")   loadUsers();
  if (page === "wallets") loadWalletCards();

  closeSidebar();
};

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("open");
}

// ══════════════════════════════════════════════════════════
//  ROLE GATING — hide elements not allowed for role
// ══════════════════════════════════════════════════════════
function applyRoleGating(role) {
  document.querySelectorAll(".role-gate").forEach(el => {
    const allowed = (el.dataset.roles || "").split(",");
    if (!allowed.includes(role)) {
      el.style.display = "none";
    }
  });
}

// ══════════════════════════════════════════════════════════
//  REALTIME WALLET (Firebase Realtime DB)
// ══════════════════════════════════════════════════════════
function listenWallet(uid) {
  const walletRef = ref(rtdb, `wallets/${uid}`);
  onValue(walletRef, async snap => {
    const raw = snap.val();

    // ── Auto-repair: if RTDB has a corrupt object (from old increment bug),
    //    read the correct value from Firestore and fix RTDB silently.
    if (typeof raw === "object" && raw !== null) {
      try {
        const userSnap = await getDoc(doc(db, "users", uid));
        const correctVal = Number(userSnap.data()?.wallet ?? 0);
        await set(walletRef, correctVal);  // fix RTDB — this will re-trigger onValue with plain number
        return;
      } catch (e) {
        console.warn("Wallet repair failed:", e);
      }
    }

    const val = Number(raw) || 0;
    document.getElementById("sidebarWallet").textContent    = val.toLocaleString();
    document.getElementById("statWallet").textContent       = val.toLocaleString();
    document.getElementById("profileWalletBig").textContent = val.toLocaleString();
    document.getElementById("costBalance").textContent      = `${val.toLocaleString()} credits`;
    if (currentData) currentData.wallet = val;
  });
}

// ══════════════════════════════════════════════════════════
//  OVERVIEW STATS
// ══════════════════════════════════════════════════════════
async function loadOverviewStats() {
  // Keys stats
  const keysQ = query(
    collection(db, "license_keys"),
    where("createdBy", "==", currentUser.uid)
  );
  const snap = await getDocs(keysQ);
  let total = 0, active = 0;
  snap.forEach(d => {
    total++;
    if (d.data().status === "active") active++;
  });
  document.getElementById("statKeys").textContent   = total;
  document.getElementById("statActive").textContent = active;

  // Sub users (owner/admin/master)
  if (ROLE_RANK[currentData.role] >= 2) {
    const usersQ = query(collection(db, "users"), where("createdBy", "==", currentUser.uid));
    const usnap  = await getDocs(usersQ);
    document.getElementById("statUsers").textContent = usnap.size;
  }
}

// ══════════════════════════════════════════════════════════
//  LISTEN KEYS (realtime)
// ══════════════════════════════════════════════════════════
function listenKeys() {
  let keysQ;
  if (currentData.role === "owner") {
    keysQ = query(collection(db, "license_keys"), orderBy("createdAt", "desc"), limit(200));
  } else {
    // No orderBy — avoids composite index requirement; sort client-side below
    keysQ = query(
      collection(db, "license_keys"),
      where("createdBy", "==", currentUser.uid)
    );
  }

  onSnapshot(keysQ, snap => {
    allKeys = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    renderKeys();
    renderRecentKeys();
    // Update stat
    let active = allKeys.filter(k => k.status === "active").length;
    document.getElementById("statKeys").textContent   = allKeys.length;
    document.getElementById("statActive").textContent = active;
    document.getElementById("keysCount").textContent  = `${allKeys.length} keys`;
  });
}

// ══════════════════════════════════════════════════════════
//  RENDER RECENT KEYS (overview)
// ══════════════════════════════════════════════════════════
function renderRecentKeys() {
  const tbody = document.getElementById("recentKeysTbody");
  const recent = allKeys.slice(0, 5);
  if (!recent.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-row">No keys yet. Generate your first key!</td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(k => `
    <tr>
      <td><span class="key-mono">${k.key}</span></td>
      <td>${typeBadge(k.type)}</td>
      <td><strong>${KEY_COST[k.type] || 0}</strong></td>
      <td><span class="badge ${k.status}">${k.status}</span></td>
      <td>${fmtDate(k.createdAt)}</td>
    </tr>
  `).join("");
}

// ══════════════════════════════════════════════════════════
//  RENDER KEYS TABLE (full)
// ══════════════════════════════════════════════════════════
function renderKeys(filtered) {
  const list  = filtered ?? allKeys;
  const tbody = document.getElementById("keysTbody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No keys found.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(k => `
    <tr>
      <td><input type="checkbox" class="key-checkbox" data-id="${k.id}" onchange="updateBulkBar()"/></td>
      <td><span class="key-mono">${k.key}</span></td>
      <td>${typeBadge(k.type)}</td>
      <td><strong>${KEY_COST[k.type] || 0}</strong></td>
      <td><span class="badge ${k.status}">${k.status}</span></td>
      <td>${k.creatorName || "—"}</td>
      <td>${fmtDate(k.createdAt)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-icon copy" onclick="copyKey('${k.key}')" title="Copy Key"><i class="fa-solid fa-copy"></i></button>
          ${k.status === "active" ? `<button class="btn-icon del" onclick="revokeKey('${k.id}')" title="Revoke"><i class="fa-solid fa-ban"></i></button>` : ""}
          ${(currentData.role === "owner" || k.createdBy === currentUser.uid) ? `<button class="btn-icon del" onclick="deleteKey('${k.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");
}

// ─── Filter keys ──────────────────────────────────────────
window.filterKeys = function() {
  const type   = document.getElementById("keyFilterType").value;
  const status = document.getElementById("keyFilterStatus").value;
  const search = document.getElementById("keySearch").value.toLowerCase();

  const filtered = allKeys.filter(k => {
    if (type   && k.type   !== type)   return false;
    if (status && k.status !== status) return false;
    if (search && !k.key.toLowerCase().includes(search)) return false;
    return true;
  });
  document.getElementById("keysCount").textContent = `${filtered.length} keys`;
  renderKeys(filtered);
};

// ─── Bulk bar ─────────────────────────────────────────────
window.updateBulkBar = function() {
  const selected = document.querySelectorAll(".key-checkbox:checked").length;
  const bar = document.getElementById("bulkBar");
  if (selected > 0) {
    bar.style.display = "flex";
    document.getElementById("bulkCount").textContent = `${selected} selected`;
  } else {
    bar.style.display = "none";
  }
};

window.bulkRevoke = async function() {
  const ids = [...document.querySelectorAll(".key-checkbox:checked")].map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Revoke ${ids.length} key(s)?`)) return;

  const batch = writeBatch(db);
  ids.forEach(id => batch.update(doc(db, "license_keys", id), { status: "revoked" }));
  await batch.commit();
  toast("success", `${ids.length} key(s) revoked.`);
  document.getElementById("bulkBar").style.display = "none";
};

// ══════════════════════════════════════════════════════════
//  KEY GENERATION
// ══════════════════════════════════════════════════════════
window.openGenModal = function() {
  updateCost();
  openModal("genKeyModal");
};

window.changeQty = function(delta) {
  const inp = document.getElementById("genQty");
  let val = parseInt(inp.value) + delta;
  val = Math.max(1, Math.min(50, val));
  inp.value = val;
  updateCost();
};

window.updateCost = function() {
  const type = document.querySelector("input[name='keyType']:checked")?.value || "weekly";
  const qty  = parseInt(document.getElementById("genQty").value) || 1;
  const cost = KEY_COST[type] * qty;
  const bal  = currentData?.wallet ?? 0;

  document.getElementById("costPerKey").textContent = KEY_COST[type].toLocaleString();
  document.getElementById("costQty").textContent    = qty;
  document.getElementById("costTotal").textContent  = `${cost.toLocaleString()} credits`;
  document.getElementById("costBalance").textContent= `${bal.toLocaleString()} credits`;

  const statusEl = document.getElementById("genStatus");
  if (cost > bal) {
    showInlineStatus(statusEl, "⚠️  Insufficient wallet balance.", "error");
    document.getElementById("genKeyBtn").disabled = true;
  } else {
    statusEl.className = "auth-status";
    statusEl.textContent = "";
    document.getElementById("genKeyBtn").disabled = false;
  }
};

window.generateKeys = async function() {
  const type = document.querySelector("input[name='keyType']:checked")?.value || "weekly";
  const qty  = parseInt(document.getElementById("genQty").value) || 1;
  const cost = KEY_COST[type] * qty;
  const bal  = currentData?.wallet ?? 0;
  const statusEl = document.getElementById("genStatus");

  if (cost > bal) {
    showInlineStatus(statusEl, "❌  Not enough credits.", "error");
    return;
  }

  document.getElementById("genKeyBtn").disabled = true;
  showInlineStatus(statusEl, "⏳  Generating keys…", "info");

  try {
    const batch = writeBatch(db);
    const generated = [];

    for (let i = 0; i < qty; i++) {
      const key = generateKeyString();
      const keyRef = doc(collection(db, "license_keys"));
      batch.set(keyRef, {
        key,
        type,
        credits:     KEY_COST[type],
        status:      "active",
        createdBy:   currentUser.uid,
        creatorName: currentData.name || "Unknown",
        createdAt:   serverTimestamp(),
        expiresAt:   getExpiry(type),
        usedBy:      null,
        usedAt:      null,
      });
      generated.push(key);
    }

    await batch.commit();

    // Deduct from wallet — store as plain number (not nested object)
    const newBal = bal - cost;
    await set(ref(rtdb, `wallets/${currentUser.uid}`), newBal);
    // Also update Firestore for consistency
    await updateDoc(doc(db, "users", currentUser.uid), { wallet: newBal });
    if (currentData) currentData.wallet = newBal;

    closeModal("genKeyModal");

    // Show results
    document.getElementById("genResultInfo").innerHTML =
      `✅  <strong>${qty}</strong> <em>${type}</em> key${qty>1?"s":""} generated! Deducted <strong>${cost.toLocaleString()} credits</strong>.`;
    document.getElementById("genKeysList").innerHTML = generated.map(k => `
      <div class="gen-key-row">
        <span>${k}</span>
        <button class="btn-icon copy" onclick="copyKey('${k}')"><i class="fa-solid fa-copy"></i></button>
      </div>
    `).join("");
    openModal("genResultModal");
    toast("success", `${qty} key${qty>1?"s":""} generated!`);

  } catch (err) {
    showInlineStatus(statusEl, `❌  ${err.message}`, "error");
    document.getElementById("genKeyBtn").disabled = false;
  }
};

window.copyAllKeys = function() {
  const keys = [...document.querySelectorAll(".gen-key-row span")].map(s => s.textContent).join("\n");
  navigator.clipboard.writeText(keys).then(() => toast("success", "All keys copied!"));
};

// Key helpers
function generateKeyString() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const seg   = () => Array.from({length:4}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function getExpiry(type) {
  const d = new Date();
  d.setDate(d.getDate() + (type === "weekly" ? 7 : 30));
  return d.toISOString();
}

// ─── Revoke / Delete ──────────────────────────────────────
window.revokeKey = async function(id) {
  if (!confirm("Revoke this key?")) return;
  await updateDoc(doc(db, "license_keys", id), { status: "revoked" });
  toast("success", "Key revoked.");
};

window.deleteKey = async function(id) {
  if (!confirm("Permanently delete this key?")) return;
  await deleteDoc(doc(db, "license_keys", id));
  toast("info", "Key deleted.");
};

window.copyKey = function(key) {
  navigator.clipboard.writeText(key).then(() => toast("info", "Key copied!"));
};

// ══════════════════════════════════════════════════════════
//  USER MANAGEMENT
// ══════════════════════════════════════════════════════════
async function loadUsers() {
  const tbody = document.getElementById("usersTbody");
  tbody.innerHTML = `<tr><td colspan="7" class="empty-row"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</td></tr>`;

  let usersQ;
  if (currentData.role === "owner") {
    usersQ = query(collection(db, "users"), orderBy("createdAt", "desc"));
  } else if (currentData.role === "admin") {
    usersQ = query(collection(db, "users"), where("createdBy", "==", currentUser.uid));
  } else if (currentData.role === "master") {
    usersQ = query(collection(db, "users"), where("createdBy", "==", currentUser.uid));
  } else {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No access.</td></tr>`;
    return;
  }

  const snap = await getDocs(usersQ);
  allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                      .filter(u => u.id !== currentUser.uid); // exclude self

  document.getElementById("statUsers").textContent = allUsers.length;
  renderUsers();
}

function renderUsers() {
  const tbody = document.getElementById("usersTbody");
  let list = allUsers;

  if (activeRoleTab !== "all") {
    list = allUsers.filter(u => u.role === activeRoleTab);
  }

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--grad-main);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">
            ${(u.name||"U").charAt(0).toUpperCase()}
          </div>
          <strong>${u.name || "—"}</strong>
        </div>
      </td>
      <td style="color:var(--text-2)"><i class="fa-solid fa-at" style="font-size:10px;margin-right:4px;opacity:.6"></i>${u.username || (u.email||"").replace("@panel.app","") || "—"}</td>
      <td>${roleBadge(u.role)}</td>
      <td><strong style="color:#a78bfa">${(u.wallet||0).toLocaleString()}</strong> cr</td>
      <td><span class="badge ${u.active !== false ? 'active' : 'revoked'}">${u.active !== false ? 'active' : 'disabled'}</span></td>
      <td style="color:var(--text-3)">${fmtDate(u.createdAt)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-icon topup" onclick="openTopup('${u.id}','${escStr(u.name)}')" title="Top-up Wallet"><i class="fa-solid fa-coins"></i></button>
          <button class="btn-icon edit"  onclick="openEditUser('${u.id}')"  title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon del"   onclick="toggleUserStatus('${u.id}','${u.active!==false}')" title="${u.active!==false?'Disable':'Enable'}">
            <i class="fa-solid ${u.active!==false?'fa-ban':'fa-circle-check'}"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

// ─── Add User ─────────────────────────────────────────────
window.openAddUserModal = function() {
  const roleSelect = document.getElementById("newUserRole");
  roleSelect.innerHTML = "";

  const canCreate = {
    owner:  ["admin","master","seller"],
    admin:  ["master","seller"],
    master: ["seller"],
    seller: []
  };
  (canCreate[currentData.role] || []).forEach(r => {
    roleSelect.innerHTML += `<option value="${r}">${r.charAt(0).toUpperCase()+r.slice(1)}</option>`;
  });

  openModal("addUserModal");
};

window.addUser = async function() {
  const name     = document.getElementById("newUserName").value.trim();
  const username = document.getElementById("newUserUsername").value.trim();
  const pw       = document.getElementById("newUserPw").value;
  const role     = document.getElementById("newUserRole").value;
  const wallet   = parseInt(document.getElementById("newUserWallet").value) || 0;
  const statusEl = document.getElementById("addUserStatus");

  if (!name || !username || !pw || !role) {
    showInlineStatus(statusEl, "❌  All fields are required.", "error"); return;
  }
  showInlineStatus(statusEl, "⏳  Creating account…", "info");

  try {
    // Get caller's ID token to authenticate the API request
    const callerToken = await currentUser.getIdToken();

    // Call server-side API (avoids Firebase signing in as new user)
    const apiBase = window.location.origin;
    const resp = await fetch(`${apiBase}/api/create-user`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, username, password: pw, role, wallet, callerToken }),
    });

    const data = await resp.json();

    if (!resp.ok || !data.success) {
      showInlineStatus(statusEl, `❌  ${data.error || "Unknown error"}`, "error");
      return;
    }

    showInlineStatus(statusEl, `✅  ${data.message}`, "success");
    toast("success", `User "${name}" created as ${role}.`);
    closeModal("addUserModal");
    loadUsers();

    // Reset form
    ["newUserName","newUserUsername","newUserPw","newUserWallet"].forEach(id => document.getElementById(id).value = "");

  } catch (err) {
    showInlineStatus(statusEl, `❌  ${err.message}`, "error");
  }
};

// ─── Edit User ────────────────────────────────────────────
window.openEditUser = async function(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return;
  const u = snap.data();

  document.getElementById("editUserTitle").innerHTML = `<i class="fa-solid fa-user-pen"></i> Edit — ${u.name}`;
  document.getElementById("editUserBody").innerHTML = `
    <div class="form-group">
      <label>Full Name</label>
      <input type="text" id="euName" value="${u.name || ""}"/>
    </div>
    <div class="form-group">
      <label>Status</label>
      <select id="euActive">
        <option value="true"  ${u.active!==false?"selected":""}>Active</option>
        <option value="false" ${u.active===false?"selected":""}>Disabled</option>
      </select>
    </div>
  `;

  document.getElementById("editUserSaveBtn").onclick = async () => {
    const name   = document.getElementById("euName").value.trim();
    const active = document.getElementById("euActive").value === "true";
    await updateDoc(doc(db, "users", uid), { name, active });
    toast("success", "User updated.");
    closeModal("editUserModal");
    loadUsers();
  };

  openModal("editUserModal");
};

// ─── Toggle user status ───────────────────────────────────
window.toggleUserStatus = async function(uid, isActive) {
  const newActive = isActive === "true" ? false : true;
  const label = newActive ? "enable" : "disable";
  if (!confirm(`Are you sure you want to ${label} this account?`)) return;
  await updateDoc(doc(db, "users", uid), { active: newActive });
  toast("success", `Account ${newActive ? "enabled" : "disabled"}.`);
  loadUsers();
};

// ─── Top-up wallet ────────────────────────────────────────
window.openTopup = function(uid, name) {
  document.getElementById("editUserTitle").innerHTML = `<i class="fa-solid fa-coins"></i> Top-up Wallet — ${name}`;
  document.getElementById("editUserBody").innerHTML = `
    <div class="form-group">
      <label>Add Credits</label>
      <div class="qty-wrap">
        <button type="button" onclick="adjustTopup(-100)">-</button>
        <input type="number" id="topupAmount" value="700" min="1"/>
        <button type="button" onclick="adjustTopup(100)">+</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      ${[700,1600,3500,7000].map(v => `<button class="btn-sm" onclick="document.getElementById('topupAmount').value=${v}">${v}</button>`).join("")}
    </div>
  `;

  window.adjustTopup = (d) => {
    const inp = document.getElementById("topupAmount");
    inp.value = Math.max(1, parseInt(inp.value)+d);
  };

  document.getElementById("editUserSaveBtn").onclick = async () => {
    const amount = parseInt(document.getElementById("topupAmount").value) || 0;
    if (amount <= 0) return;

    // Read current balance from Firestore (source of truth)
    const usnap  = await getDoc(doc(db, "users", uid));
    const curBal = Number(usnap.data()?.wallet) || 0;
    const newBal = curBal + amount;

    // Update both stores as plain number
    await set(ref(rtdb, `wallets/${uid}`), newBal);
    await updateDoc(doc(db, "users", uid), { wallet: newBal });

    // ── Instant UI update — no refresh needed ──────────────
    // Update in-memory allUsers so re-render shows new balance
    const u = allUsers.find(x => x.id === uid);
    if (u) u.wallet = newBal;
    renderUsers();

    toast("success", `+${amount.toLocaleString()} credits added to ${name}.`);
    closeModal("editUserModal");
  };

  openModal("editUserModal");
};

// ══════════════════════════════════════════════════════════
//  WALLET CARDS PAGE
// ══════════════════════════════════════════════════════════
async function loadWalletCards() {
  const container = document.getElementById("walletCards");
  container.innerHTML = `<div style="color:var(--text-3);padding:20px"><i class="fa-solid fa-spinner fa-spin"></i> Loading wallets…</div>`;

  let usersQ;
  if (currentData.role === "owner") {
    usersQ = query(collection(db, "users"), orderBy("createdAt","desc"));
  } else {
    usersQ = query(collection(db, "users"), where("createdBy","==", currentUser.uid));
  }

  const snap = await getDocs(usersQ);
  const users = snap.docs.map(d => ({id: d.id, ...d.data()}));

  if (!users.length) {
    container.innerHTML = `<div style="color:var(--text-3);padding:20px">No users to show.</div>`;
    return;
  }

  container.innerHTML = users.map(u => `
    <div class="wallet-card">
      <div class="wc-top">
        <div class="wc-avatar">${(u.name||"U").charAt(0).toUpperCase()}</div>
        <div>
          <div class="wc-name">${u.name||"—"}</div>
          <div class="wc-role">${roleBadge(u.role)}</div>
        </div>
      </div>
      <div class="wc-balance" id="wc-bal-${u.id}">
        ${(u.wallet||0).toLocaleString()} <small>credits</small>
      </div>
      <div class="wc-add-wrap">
        <input type="number" id="wci-${u.id}" placeholder="Add credits…" min="1"/>
        <button class="btn-primary-sm" onclick="walletTopup('${u.id}','${escStr(u.name)}')">
          <i class="fa-solid fa-plus"></i> Add
        </button>
      </div>
    </div>
  `).join("");

  // Listen to realtime wallet for each user
  users.forEach(u => {
    const wRef = ref(rtdb, `wallets/${u.id}`);
    onValue(wRef, async snap => {
      const el  = document.getElementById(`wc-bal-${u.id}`);
      const raw = snap.val();
      // Auto-repair corrupt object wallet
      if (typeof raw === "object" && raw !== null) {
        try {
          const uSnap = await getDoc(doc(db, "users", u.id));
          const correctVal = Number(uSnap.data()?.wallet ?? 0);
          await set(wRef, correctVal);
        } catch(e) {}
        return;
      }
      const val = Number(raw) || 0;
      if (el) el.innerHTML = `${val.toLocaleString()} <small>credits</small>`;
    });
  });
}

window.walletTopup = async function(uid, name) {
  const inp    = document.getElementById(`wci-${uid}`);
  const amount = parseInt(inp.value) || 0;
  if (amount <= 0) { toast("warn", "Enter a valid amount."); return; }

  // Read current balance from Firestore (source of truth)
  const usnap  = await getDoc(doc(db, "users", uid));
  const curBal = Number(usnap.data()?.wallet) || 0;
  const newBal = curBal + amount;

  // Update both stores as plain number
  await set(ref(rtdb, `wallets/${uid}`), newBal);
  await updateDoc(doc(db, "users", uid), { wallet: newBal });

  inp.value = "";
  toast("success", `+${amount.toLocaleString()} added to ${name}.`);
};

// ══════════════════════════════════════════════════════════
//  PROFILE — Change Password
// ══════════════════════════════════════════════════════════
async function handlePwChange(e) {
  e.preventDefault();
  const cur     = document.getElementById("curPw").value;
  const newp    = document.getElementById("newPw").value;
  const confirm = document.getElementById("confirmPw").value;
  const status  = document.getElementById("pwChangeStatus");

  if (!cur)           { showInlineStatus(status,"❌  Enter your current password.","error"); return; }
  if (!newp)          { showInlineStatus(status,"❌  Enter a new password.","error"); return; }
  if (newp !== confirm) { showInlineStatus(status,"❌  Passwords do not match.","error"); return; }

  try {
    const cred = EmailAuthProvider.credential(currentUser.email, toPaddedPw(cur));
    await reauthenticateWithCredential(currentUser, cred);
    await updatePassword(currentUser, toPaddedPw(newp));
    showInlineStatus(status,"✅  Password updated successfully!","success");
    document.getElementById("changePwForm").reset();
  } catch (err) {
    showInlineStatus(status,`❌  ${err.message}`,"error");
  }
}

// ══════════════════════════════════════════════════════════
//  LOGOUT
// ══════════════════════════════════════════════════════════
async function handleLogout() {
  if (!confirm("Logout?")) return;
  await signOut(auth);
  window.location.href = "index.html";
}

// ══════════════════════════════════════════════════════════
//  MODAL HELPERS
// ══════════════════════════════════════════════════════════
window.openModal = function(id) {
  document.getElementById(id).classList.add("open");
};
window.closeModal = function(id) {
  document.getElementById(id).classList.remove("open");
};

// Close modal on overlay click
document.querySelectorAll(".modal-overlay").forEach(ov => {
  ov.addEventListener("click", e => { if (e.target === ov) ov.classList.remove("open"); });
});

// ══════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════
window.toast = function(type, msg) {
  const icons = { success:"fa-circle-check", error:"fa-circle-xmark", info:"fa-circle-info", warn:"fa-triangle-exclamation" };
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]||"fa-info"}"></i><span>${msg}</span>`;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 3500);
};

// ══════════════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════════════
function roleBadge(role) {
  return `<span class="role-badge ${role}">${(role||"—").toUpperCase()}</span>`;
}
function typeBadge(type) {
  const color = type === "weekly" ? "#60a5fa" : "#a78bfa";
  return `<span style="font-size:12px;font-weight:700;color:${color}">${type==="weekly"?"7D":"30D"}</span>`;
}
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
}
function escStr(s) {
  return (s||"").replace(/'/g,"\\'").replace(/"/g,"&quot;");
}
function showInlineStatus(el, msg, type) {
  el.textContent = msg;
  el.className   = `auth-status ${type}`;
}
