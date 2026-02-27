// ═══════════════════════════════════════════════════════
//  pANEL — Local Development Server
//  Serves: web/ (static) + /api/* (same handlers as Vercel)
//
//  Setup:
//    1. Copy .env.example → .env and fill in Firebase service account values
//    2. npm install
//    3. node server.js
//  Then open: http://localhost:5500
// ═══════════════════════════════════════════════════════

require("dotenv").config();

const http = require("http");
const fs   = require("fs");
const path = require("path");
const url  = require("url");

const PORT = process.env.PORT || 5500;

// ── MIME types ────────────────────────────────────────────────
const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
  ".woff": "font/woff",
  ".ttf":  "font/ttf",
};

// ── Vercel-compatible adapter ─────────────────────────────────
// Wraps Node's IncomingMessage/ServerResponse to match Vercel's API shape:
//   req.body (parsed JSON)  req.query (URL params)
//   res.status(n)           res.json(obj)           res.end()
function adaptReq(req, parsedUrl, body) {
  req.query = Object.fromEntries(new URLSearchParams(parsedUrl.search));
  req.body  = body;
  return req;
}

function adaptRes(res) {
  let _status = 200;

  res.status = function (code) {
    _status = code;
    return res;
  };

  res.json = function (data) {
    res.writeHead(_status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  // override end to use stored status (for OPTIONS 200)
  const _origEnd = res.end.bind(res);
  res.end = function (...args) {
    if (!res.headersSent) res.writeHead(_status);
    _origEnd(...args);
  };

  return res;
}

// ── Parse request body ─────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      try { resolve(JSON.parse(chunks)); }
      catch { resolve({}); }
    });
  });
}

// ── Load API handlers (lazy, same exports as Vercel functions) ─
const apiHandlers = {
  "/api/verify":      () => require("./api/verify"),
  "/api/create-user": () => require("./api/create-user"),
};

// ── HTTP server ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url || "/");
  const pathname = parsed.pathname;

  // ── CORS pre-flight ────────────────────────────────────────
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ── API routes ─────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const handlerFactory = apiHandlers[pathname];
    if (handlerFactory) {
      const body = await parseBody(req);
      adaptReq(req, parsed, body);
      adaptRes(res);
      try {
        await handlerFactory()(req, res);
      } catch (err) {
        console.error("[API Error]", err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error: " + err.message });
        }
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API route not found: " + pathname }));
    }
    return;
  }

  // ── Static file serving from web/ ─────────────────────────
  let filePath;

  if (pathname === "/" || pathname === "") {
    filePath = path.join(__dirname, "web", "index.html");
  } else {
    filePath = path.join(__dirname, "web", pathname);
  }

  // Security: prevent path traversal outside web/
  const webRoot = path.resolve(__dirname, "web");
  if (!path.resolve(filePath).startsWith(webRoot)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try appending .html
      const withHtml = filePath + ".html";
      fs.stat(withHtml, (err2, stat2) => {
        if (err2 || !stat2.isFile()) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          return res.end("404 — " + pathname);
        }
        serveFile(withHtml, res);
      });
      return;
    }
    serveFile(filePath, res);
  });
});

function serveFile(filePath, res) {
  const ext     = path.extname(filePath).toLowerCase();
  const mime    = MIME[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": mime });
  res.end(content);
}

server.listen(PORT, () => {
  console.log("╔══════════════════════════════════════════╗");
  console.log(`║  pANEL dev server → http://localhost:${PORT}  ║`);
  console.log("╠══════════════════════════════════════════╣");
  console.log("║  Static files:  web/                     ║");
  console.log("║  API routes:    /api/verify               ║");
  console.log("║                 /api/create-user          ║");
  console.log("╠══════════════════════════════════════════╣");

  const envOk = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
  if (envOk) {
    console.log("║  Firebase Admin: ✅ env vars found        ║");
  } else {
    console.log("║  Firebase Admin: ⚠️  .env not configured  ║");
    console.log("║  API routes won't work until you add:    ║");
    console.log("║    FIREBASE_PROJECT_ID                   ║");
    console.log("║    FIREBASE_CLIENT_EMAIL                 ║");
    console.log("║    FIREBASE_PRIVATE_KEY                  ║");
    console.log("║  See .env.example for instructions       ║");
  }
  console.log("╚══════════════════════════════════════════╝");
});
