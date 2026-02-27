# 🔥 pANEL — Firebase Complete Setup Guide

> Is guide mein poora setup cover hai:
> Authentication · Firestore · Realtime Database · Security Rules · Vercel API

---

## STEP 1 — Firebase Project Banao

1. Browser mein kholo: **https://console.firebase.google.com**
2. **"Add project"** click karo
3. Project naam likho → e.g. `panel-app`
4. Google Analytics → optional hai, skip kar sakte ho
5. **"Create project"** click karo → wait karo jab tak ready na ho

---

## STEP 2 — Authentication Enable Karo

1. Left sidebar → **Build → Authentication**
2. **"Get started"** click karo
3. **"Sign-in method"** tab → **"Email/Password"** click karo
4. **Pehla toggle (Email/Password)** → Enable karo ✅
5. **Doosra toggle (Email link / passwordless)** → Disable rakho ❌
6. **"Save"** click karo

> ℹ️ Panel mein **Username** use hota hai, lekin Firebase internally
> `username@panel.app` format mein store karta hai. User ko sirf username dikhta hai.

---

## STEP 3 — Firestore Database Enable Karo

1. Left sidebar → **Build → Firestore Database**
2. **"Create database"** click karo
3. **Location** select karo → `asia-south1 (Mumbai)` ✅ (India ke liye)
4. **"Start in production mode"** select karo
5. **"Enable"** click karo

---

## STEP 4 — Firestore Security Rules Set Karo

**Firestore Database → Rules tab** mein jao, sab kuch delete karo aur ye paste karo:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isAuth()  { return request.auth != null; }
    function uid()     { return request.auth.uid; }
    function myData()  { return get(/databases/$(database)/documents/users/$(uid())).data; }
    function myRole()  { return myData().role; }
    function roleRank(role) {
      return role == "owner" ? 4 : role == "admin" ? 3 : role == "master" ? 2 : 1;
    }
    function canManage(targetRole) {
      return roleRank(myRole()) > roleRank(targetRole);
    }
    function isActive() { return myData().active != false; }

    match /users/{userId} {
      allow read: if isAuth() && isActive() && (
        uid() == userId || roleRank(myRole()) > 1
      );
      allow create: if isAuth() && isActive() && canManage(request.resource.data.role);
      allow update: if isAuth() && isActive() && (
        uid() == userId || canManage(resource.data.role)
      );
      allow delete: if isAuth() && isActive() && myRole() == "owner";
    }

    match /license_keys/{keyId} {
      allow read:   if true;
      allow create: if isAuth() && isActive() && request.resource.data.createdBy == uid();
      allow update: if isAuth() && isActive() && (
        resource.data.createdBy == uid() || myRole() == "owner" || myRole() == "admin"
      );
      allow delete: if isAuth() && isActive() && (
        resource.data.createdBy == uid() || myRole() == "owner"
      );
    }
  }
}
```

**"Publish"** click karo ✅

---

## STEP 5 — Realtime Database Enable Karo

1. Left sidebar → **Build → Realtime Database**
2. **"Create database"** click karo
3. **Location** → `United States (us-central1)` (default)
4. **"Start in locked mode"** select karo
5. **"Enable"** click karo

---

## STEP 6 — Realtime Database Rules Set Karo

**Realtime Database → Rules tab** mein ye paste karo:

```json
{
  "rules": {
    "wallets": {
      "$uid": {
        ".read":  "auth != null && auth.uid === $uid",
        ".write": "auth != null"
      }
    }
  }
}
```

**"Publish"** click karo ✅

> Har user sirf apna wallet read kar sakta hai.
> Write: koi bhi logged-in user (Owner/Admin dashboard se top-up karte hain).

---

## STEP 7 — Web App Register Karo & Config Copy Karo

1. Firebase Console → **Project Settings** (gear icon ⚙️ — top-left)
2. **"General"** tab → scroll down → **"Your apps"** section
3. **"Add app"** click karo → **Web icon `</>`** select karo
4. App nickname: `pANEL Web`
5. **"Firebase Hosting"** → tick mat karo (Vercel use karenge)
6. **"Register app"** click karo
7. Neeche yeh config dikhega — **poora copy karo**:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain:        "panel-app.firebaseapp.com",
  databaseURL:       "https://panel-app-default-rtdb.firebaseio.com/",
  projectId:         "panel-app",
  storageBucket:     "panel-app.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdefabcdef"
};
```

---

## STEP 8 — firebase-config.js Update Karo

`web/js/firebase-config.js` file kholo aur PLACEHOLDER values apne config se replace karo:

```javascript
const firebaseConfig = {
  apiKey:            "APNA_API_KEY",
  authDomain:        "APNA_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://APNA_PROJECT_ID-default-rtdb.firebaseio.com/",
  projectId:         "APNA_PROJECT_ID",
  storageBucket:     "APNA_PROJECT_ID.appspot.com",
  messagingSenderId: "APNA_SENDER_ID",
  appId:             "APNA_APP_ID"
};
```

---

## STEP 9 — Authorized Domain Add Karo (Vercel ke liye ZAROOR)

> Agar yeh step skip karo toh login par `auth/unauthorized-domain` error aayega!

1. Firebase Console → **Authentication → Settings** tab
2. **"Authorized domains"** section mein jao
3. **"Add domain"** click karo
4. Apna Vercel domain: `your-panel.vercel.app`
5. **"Add"** click karo ✅

> Local testing ke liye `localhost` already allowed hota hai.

---

## STEP 10 — Owner Account Banao (Sirf Ek Baar)

1. Browser mein kholo: `https://your-panel.vercel.app/setup.html`
2. Form bharo:
   - **Full Name** → Apna naam
   - **Username** → Login ke liye (e.g. `owner`, `rahul99`)
   - **Password** → Koi bhi — `123`, `abc`, `xyz99` sab chalega
   - **Starting Wallet Credits** → e.g. `99999`
3. **"Create Owner Account"** click karo ✅
4. **SUCCESS ke baad `setup.html` FILE DELETE KAR DO!** ⚠️

---

## STEP 11 — Vercel ke liye Service Account Banao

> Yeh `/api/verify` (key verification endpoint) ke liye zaroor chahiye.

1. Firebase Console → **Project Settings** (gear ⚙️)
2. **"Service accounts"** tab click karo
3. **"Generate new private key"** → JSON file download hogi

   JSON file kuch aisi hogi:
   ```json
   {
     "project_id": "panel-app",
     "client_email": "firebase-adminsdk-xxxxx@panel-app.iam.gserviceaccount.com",
     "private_key": "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
   }
   ```

4. **Vercel** → Project → **Settings → Environment Variables** mein add karo:

| Variable Name          | JSON file ki value                  |
|------------------------|-------------------------------------|
| `FIREBASE_PROJECT_ID`  | `"project_id"` ki value             |
| `FIREBASE_CLIENT_EMAIL`| `"client_email"` ki value           |
| `FIREBASE_PRIVATE_KEY` | `"private_key"` poori value         |

> ⚠️ `FIREBASE_PRIVATE_KEY` paste karte waqt Vercel ka multiline paste use karo.
> JSON file se directly copy-paste karo — `\n` newlines sahi se aa jaaenge.

5. Save ke baad **Redeploy** karo Vercel se.

---

## STEP 12 — Vercel Pe Deploy Karo

```bash
# Root folder se (pANEL/)
git init
git add .
git commit -m "pANEL initial deploy"

git remote add origin https://github.com/TUMHARA_USERNAME/panel.git
git push -u origin main
```

Phir:
1. **https://vercel.com/new** → GitHub repo select karo
2. **Root Directory** → `/` (root — vercel.json already hai)
3. **Framework Preset** → Other
4. **"Deploy"** click karo ✅

---

## Firestore Data Structure (Reference)

```
users/
  {uid}/
    name:       "Rahul Kumar"
    username:   "rahul99"             ← login ke liye
    email:      "rahul99@panel.app"   ← internal only
    role:       "owner" | "admin" | "master" | "seller"
    wallet:     5000
    active:     true
    createdBy:  "uid_of_creator"
    createdAt:  Timestamp

license_keys/
  {keyId}/
    type:        "weekly" | "monthly"
    status:      "active" | "used" | "revoked" | "expired"
    hwid:        null → first use par bind hota hai
    createdBy:   "uid_of_user"
    expiresAt:   Timestamp
    createdAt:   Timestamp
    firstUsedAt: Timestamp
```

```
wallets/   ← Realtime Database
  {uid}: 5000
```

---

## Roles & Permissions

| Role       | Kaun bana sakta hai        | Kya manage kar sakta hai          |
|------------|----------------------------|------------------------------------|
| **Owner**  | Koi nahi (setup.html se)   | Sab kuch — full control            |
| **Admin**  | Owner                      | Master, Seller, Keys, Wallets      |
| **Master** | Owner, Admin               | Seller, Keys                       |
| **Seller** | Owner, Admin, Master       | Sirf apni keys                     |

---

## ⚠️ Security Checklist

- [ ] `setup.html` delete kar do deploy ke baad
- [ ] Service Account JSON file ko `.gitignore` mein add karo
- [ ] Vercel domain ko Firebase Authorized Domains mein add karo
- [ ] `FIREBASE_PRIVATE_KEY` sirf Vercel Environment Variables mein daalo — code mein nahi

```
# .gitignore mein ye lines add karo
service-account*.json
firebase-key*.json
.env
.env.local
```
