#!/usr/bin/env node
/**
 * Institutional EA — Multi-Platform Release & Checksum Verifier
 *
 * Verifies:
 *   1. GitHub Releases API (/releases/latest) status, tag_name, and assets.
 *   2. Genuine GET-based HTTP verification & redirect inspection for Windows (.exe),
 *      macOS (.dmg), Android (.apk), and SHA256SUMS.txt.
 *   3. Streaming SHA-256 calculation & comparison against published SHA256SUMS.txt
 *      when public release assets are reachable (pass --verify-hashes to stream full binaries).
 *   4. Optional local release directory audit (--local-release-dir <path>) to detect
 *      obsolete or duplicate installers.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const releases = require(path.resolve(__dirname, "..", "js", "releases.js"));

async function verifyGetEndpoint(label, url, options = {}) {
  const { computeFullSha256 = false } = options;
  try {
    const controller = new AbortController();
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const status = res.status;
    const finalUrl = res.url;
    const contentLength = res.headers.get("content-length");

    let sha256 = null;
    if (res.ok && computeFullSha256 && res.body) {
      const hash = crypto.createHash("sha256");
      for await (const chunk of res.body) {
        hash.update(chunk);
      }
      sha256 = hash.digest("hex");
    } else {
      // Genuine GET verified headers + redirect chain; abort body stream cleanly
      controller.abort();
    }

    return { label, url, status, ok: res.ok, finalUrl, contentLength, sha256 };
  } catch (err) {
    return { label, url, status: 0, ok: false, error: err.message };
  }
}

function auditLocalReleaseDir(dirPath) {
  console.log(`\nLocal Release Directory Audit: ${dirPath}`);
  if (!fs.existsSync(dirPath)) {
    console.log(`  [FAIL] Directory does not exist: ${dirPath}`);
    return false;
  }
  const files = fs.readdirSync(dirPath).filter((f) => fs.statSync(path.join(dirPath, f)).isFile());
  const exeFiles = files.filter((f) => f.toLowerCase().endsWith(".exe"));
  const obsolete = exeFiles.filter((f) => f !== "InstitutionalEA-Setup.exe");

  console.log(`  Files present (${files.length}): ${files.join(", ")}`);
  if (!exeFiles.includes("InstitutionalEA-Setup.exe")) {
    console.log("  [FAIL] Missing canonical InstitutionalEA-Setup.exe");
    return false;
  }
  if (obsolete.length > 0) {
    console.log(`  [FAIL] Duplicate or obsolete Windows installers detected: ${obsolete.join(", ")}`);
    return false;
  }
  if (!files.includes("InstitutionalEA-Setup.exe.sha256") || !files.includes("latest.yml")) {
    console.log("  [FAIL] Missing InstitutionalEA-Setup.exe.sha256 or latest.yml");
    return false;
  }
  console.log("  [OK] Single canonical InstitutionalEA-Setup.exe + .sha256 + latest.yml verified.");
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const verifyHashes = args.includes("--verify-hashes");
  const localDirIdx = args.indexOf("--local-release-dir");
  const localReleaseDir = localDirIdx !== -1 ? args[localDirIdx + 1] : null;

  console.log("=== INSTITUTIONAL EA MULTI-PLATFORM RELEASE VERIFICATION ===");
  console.log(`API Endpoint: ${releases.RELEASES_API_URL}\n`);

  let apiOk = false;
  try {
    const data = await releases.fetchLatestRelease({ maxRetries: 0 });
    apiOk = true;
    console.log(`[OK] GitHub API returned stable release ${data.tagName} (published: ${data.publishedAt || "n/a"})`);
    for (const [platform, info] of Object.entries(data.platforms)) {
      console.log(
        `  - ${platform}: available=${info.available} name=${info.name || "none"} url=${info.url || "none"}`
      );
    }
    console.log(`  - checksums: ${data.checksumsUrl || "none"}`);
  } catch (err) {
    console.log(`[FAIL] GitHub API check failed: ${err.message} (code=${err.code || "UNKNOWN"})`);
  }

  console.log("\nDirect Official URL Checks (GET + Redirect):");
  const checks = await Promise.all([
    verifyGetEndpoint("Releases Page", releases.DOWNLOAD_URLS.releases),
    verifyGetEndpoint("Windows (.exe)", releases.DOWNLOAD_URLS.windows, { computeFullSha256: verifyHashes }),
    verifyGetEndpoint("macOS (.dmg)", releases.DOWNLOAD_URLS.macos, { computeFullSha256: verifyHashes }),
    verifyGetEndpoint("Android (.apk)", releases.DOWNLOAD_URLS.android, { computeFullSha256: verifyHashes }),
    verifyGetEndpoint("Checksums (SHA256SUMS.txt)", releases.DOWNLOAD_URLS.checksums),
  ]);

  for (const c of checks) {
    console.log(
      `  [${c.ok ? "OK" : "FAIL"}] ${c.label}: HTTP ${c.status}${c.contentLength ? ` (${c.contentLength} bytes)` : ""} -> ${c.finalUrl || c.error}`
    );
  }

  let checksumsOk = false;
  const checksumCheck = checks.find((c) => c.label.includes("SHA256SUMS.txt"));
  if (checksumCheck && checksumCheck.ok) {
    const txt = await (await fetch(releases.DOWNLOAD_URLS.checksums)).text();
    const expectedMap = new Map();
    for (const rawLine of txt.split(/\r?\n/)) {
      const m = rawLine.trim().match(/^([a-f0-9]{64})\s+(\S+)$/i);
      if (m) expectedMap.set(m[2], m[1].toLowerCase());
    }
    console.log(`\n[OK] SHA256SUMS.txt parsed: ${expectedMap.size} valid SHA-256 entries.`);
    checksumsOk = expectedMap.size > 0;
    if (verifyHashes) {
      for (const c of checks) {
        if (!c.sha256) continue;
        const fname = path.basename(new URL(c.url).pathname);
        const expected = expectedMap.get(fname);
        if (expected && expected === c.sha256) {
          console.log(`  [OK] SHA-256 match for ${fname}: ${c.sha256}`);
        } else {
          console.log(`  [FAIL] SHA-256 mismatch for ${fname} (expected=${expected}, actual=${c.sha256})`);
          checksumsOk = false;
        }
      }
    }
  } else {
    console.log("\n[WARN] SHA256SUMS.txt is not publicly reachable (HTTP 404). Cannot verify checksums until the release repository is public.");
  }

  let localOk = true;
  if (localReleaseDir) {
    localOk = auditLocalReleaseDir(localReleaseDir);
  }

  if (!apiOk || !checksumsOk || !localOk || checks.some((c) => !c.ok)) {
    process.exitCode = 1;
  }
}

main();
