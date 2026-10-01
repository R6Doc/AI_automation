#!/usr/bin/env node
// Match Generator agent: a tiny local service on the designer's Mac.
// It accepts a match list from the dashboard, downloads the logos, and drives Illustrator.
// No dependencies beyond Node itself.

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

const VERSION = "1.0.0";
const ROOT = __dirname;
const MAX_MATCHES = 10;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_TYPES = { ".svg": "image/svg+xml", ".png": "image/png" };

const config = loadConfig();
const expandHome = (p) => (p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);
const TEMPLATE_PATH = path.resolve(ROOT, expandHome(config.templatePath));
const OUTPUT_DIR = path.resolve(ROOT, expandHome(config.outputDir));
const WORK_DIR = path.join(ROOT, "work");
const LOGO_CACHE = path.join(WORK_DIR, "logos");
const JSX_PATH = path.join(ROOT, "illustrator", "generate.jsx");

let busy = false;

function loadConfig() {
  const file = path.join(ROOT, "config.json");
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}. Copy config.example.json to config.json and edit it.`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    port: 3030,
    illustratorApp: "Adobe Illustrator",
    templatePath: "template/template.ai",
    outputDir: "~/Documents/Match Graphics",
    templateRowCount: 8,
    ...cfg,
    allowedOrigins: (cfg.allowedOrigins || []).map((o) => o.replace(/\/$/, "")),
  };
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// ---------- validation: only the exact expected shape gets through ----------

class BadRequest extends Error {}

function str(value, field, max) {
  if (typeof value !== "string") throw new BadRequest(`${field} must be text.`);
  const v = value.trim();
  if (!v) throw new BadRequest(`${field} is empty.`);
  if (v.length > max) throw new BadRequest(`${field} is too long.`);
  // Printable characters only: no control characters reach Illustrator.
  if (/[\u0000-\u001f\u007f]/.test(v)) throw new BadRequest(`${field} contains invalid characters.`);
  return v;
}

function validateLogoUrl(value, field) {
  if (value === null || value === undefined) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequest(`${field} is not a valid URL.`);
  }
  // Logos may only come from the dashboard itself.
  if (!config.allowedOrigins.includes(url.origin)) throw new BadRequest(`${field} is not from the dashboard.`);
  if (!url.pathname.startsWith("/logos/")) throw new BadRequest(`${field} is not a logo.`);
  if (!LOGO_TYPES[path.extname(url.pathname).toLowerCase()]) throw new BadRequest(`${field} must be .svg or .png.`);
  return url.href;
}

function validateTeam(t, field) {
  if (!t || typeof t !== "object") throw new BadRequest(`${field} is missing.`);
  const lines = Array.isArray(t.lines) ? t.lines : [];
  if (lines.length < 1 || lines.length > 4) throw new BadRequest(`${field} must have 1 to 4 lines.`);
  return {
    name: str(t.name, `${field} name`, 60),
    lines: lines.map((l, i) => str(l, `${field} line ${i + 1}`, 40)),
    logoUrl: validateLogoUrl(t.logoUrl, `${field} logo`),
  };
}

function validateJob(body) {
  if (!body || typeof body !== "object") throw new BadRequest("Request body must be JSON.");
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new BadRequest("date must be YYYY-MM-DD.");
  if (!Array.isArray(body.matches) || body.matches.length < 1 || body.matches.length > MAX_MATCHES) {
    throw new BadRequest(`Send between 1 and ${MAX_MATCHES} matches.`);
  }
  return {
    date: body.date,
    dateLabel: str(body.dateLabel, "dateLabel", 60),
    matches: body.matches.map((m, i) => ({
      home: validateTeam(m && m.home, `Match ${i + 1} home team`),
      away: validateTeam(m && m.away, `Match ${i + 1} away team`),
      time: str(m && m.time, `Match ${i + 1} time`, 20),
    })),
  };
}

// ---------- logos ----------

async function downloadLogo(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  const file = path.join(LOGO_CACHE, crypto.createHash("sha1").update(url).digest("hex") + ext);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_LOGO_BYTES) throw new Error("file too large");
    fs.writeFileSync(file, buf);
    return file;
  } catch (err) {
    // Offline or temporary failure: fall back to the last downloaded copy if we have one.
    if (fs.existsSync(file)) return file;
    throw err;
  }
}

async function resolveLogos(job, warnings) {
  fs.mkdirSync(LOGO_CACHE, { recursive: true });
  const cache = new Map();
  for (const match of job.matches) {
    for (const team of [match.home, match.away]) {
      const url = team.logoUrl;
      delete team.logoUrl;
      team.logoPath = null;
      if (!url) continue;
      try {
        if (!cache.has(url)) cache.set(url, await downloadLogo(url));
        team.logoPath = cache.get(url);
      } catch (err) {
        warnings.push(`Couldn't download the ${team.name} logo (${err.message}); left it empty.`);
      }
    }
  }
}

// ---------- Illustrator ----------

function outputPathFor(date) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const base = `${date}-college-football`;
  let candidate = path.join(OUTPUT_DIR, `${base}.ai`);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(OUTPUT_DIR, `${base}-${n}.ai`);
  return candidate;
}

// Runs generate.jsx inside Illustrator. Request data never touches the AppleScript source: the
// job travels as a file path through argv. The app name comes from the local config and has to be
// a literal so AppleScript can resolve Illustrator's `do javascript` command.
if (!/^[A-Za-z0-9 ().-]+$/.test(config.illustratorApp)) {
  console.error(`Invalid illustratorApp in config.json: ${config.illustratorApp}`);
  process.exit(1);
}
const APPLESCRIPT = `
on run argv
  set jsxFile to POSIX file (item 1 of argv) as alias
  set jobPath to item 2 of argv
  with timeout of 600 seconds
    tell application "${config.illustratorApp}"
      activate
      set res to do javascript jsxFile with arguments {jobPath}
    end tell
  end timeout
  return res
end run`;

function runIllustrator(jobPath) {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", APPLESCRIPT, JSX_PATH, jobPath],
      { timeout: 11 * 60 * 1000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(friendlyAppleScriptError(stderr || err.message)));
        resolve(stdout.trim());
      },
    );
  });
}

function friendlyAppleScriptError(msg) {
  if (/-1743|not allowed to send Apple events|Not authorized/i.test(msg)) {
    return "macOS is blocking the generator from controlling Illustrator. Open System Settings → Privacy & Security → Automation and allow it.";
  }
  if (/-1728|Can.t get application|-10814/i.test(msg)) {
    return `Couldn't find the app "${config.illustratorApp}". Check illustratorApp in the agent's config.json.`;
  }
  return `Illustrator error: ${msg.trim()}`;
}

async function generate(job) {
  const warnings = [];
  if (!fs.existsSync(TEMPLATE_PATH)) throw new Error(`Template not found at ${TEMPLATE_PATH}.`);
  await resolveLogos(job, warnings);

  const outputPath = outputPathFor(job.date);
  const jobPath = path.join(WORK_DIR, "job.json");
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(jobPath, JSON.stringify({ ...job, templatePath: TEMPLATE_PATH, outputPath, templateRowCount: config.templateRowCount }, null, 2));

  const raw = await runIllustrator(jobPath);
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(`Unexpected response from Illustrator: ${raw.slice(0, 300)}`);
  }
  if (!result.ok) throw new Error(result.error || "Illustrator script failed.");
  return { file: path.basename(result.file || outputPath), path: result.file || outputPath, warnings: warnings.concat(result.warnings || []) };
}

// ---------- HTTP ----------

function send(res, status, body, origin) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BadRequest("Request too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowed = origin && config.allowedOrigins.includes(origin) ? origin : null;
  const url = new URL(req.url, "http://127.0.0.1");

  // Browsers must come from the dashboard. (Requests without an Origin, e.g. curl on this Mac, may use /health only.)
  if (origin && !allowed) return send(res, 403, { ok: false, error: "Origin not allowed." });

  if (req.method === "OPTIONS") {
    res.writeHead(allowed ? 204 : 403, {
      "Access-Control-Allow-Origin": allowed || "",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true, version: VERSION, busy, templateFound: fs.existsSync(TEMPLATE_PATH) }, allowed);
  }

  if (req.method === "POST" && url.pathname === "/generate") {
    if (!allowed) return send(res, 403, { ok: false, error: "Origin not allowed." });
    if (!/^application\/json/.test(req.headers["content-type"] || "")) {
      return send(res, 415, { ok: false, error: "Expected JSON." }, allowed);
    }
    if (busy) return send(res, 409, { ok: false, error: "Already generating a graphic. Wait for it to finish." }, allowed);
    busy = true;
    try {
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (err) {
        throw err instanceof BadRequest ? err : new BadRequest("Request body must be JSON.");
      }
      const job = validateJob(body);
      log(`Generating ${job.date} with ${job.matches.length} matches`);
      const result = await generate(job);
      log(`Saved ${result.path}`);
      send(res, 200, { ok: true, ...result }, allowed);
    } catch (err) {
      log("Error:", err.message);
      send(res, err instanceof BadRequest ? 400 : 500, { ok: false, error: err.message }, allowed);
    } finally {
      busy = false;
    }
    return;
  }

  send(res, 404, { ok: false, error: "Not found." }, allowed);
});

// Loopback only: nothing else on the network can reach this service.
if (require.main === module) server.listen(config.port, "127.0.0.1", () => {
  log(`Match Generator agent v${VERSION} listening on http://127.0.0.1:${config.port}`);
  log(`Allowed origins: ${config.allowedOrigins.join(", ") || "(none!)"}`);
  log(`Template: ${TEMPLATE_PATH}${fs.existsSync(TEMPLATE_PATH) ? "" : "  (NOT FOUND)"}`);
  log(`Output:   ${OUTPUT_DIR}`);
});

module.exports = { server, validateJob, BadRequest };
