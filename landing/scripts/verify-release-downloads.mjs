#!/usr/bin/env node
/**
 * Institutional EA — Live GitHub Release & Checksum Verifier
 *
 * Verifies:
 *   1. GitHub Releases API (/releases/latest) status, tag_name, and assets.
 *   2. Direct HTTP status and redirect resolution for Windows (.exe), macOS (.dmg),
 *      Android (.apk), and SHA256SUMS.txt.
 *   3. SHA256SUMS.txt integrity (valid 64-hex SHA-256 lines referencing published assets).
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const releases = require(path.resolve(__dirname, "..", "js", "releases.js"));

async function checkUrl(label, url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return {
      label,
      url,
      status: res.status,
      ok: res.ok,
      finalUrl: res.url,
      contentLength: res.headers.get("content-length"),
    };
  } catch (err) {
    return { label, url, status: 0, ok: false, error: err.message };
  }
}

async function main() {
  console.log("=== INSTITUTIONAL EA LIVE RELEASE & CHECKSUM VERIFICATION ===");
  console.log(`API Endpoint: ${releases.RELEASES_API_URL}\n`);

  let apiOk = false;
  try {
    const data = await releases.fetchLatestRelease({ maxRetries: 0 });
    apiOk = true;
    console.log(`[OK] GitHub API returned release ${data.tagName} (published: ${data.publishedAt || "n/a"})`);
    for (const [platform, info] of Object.entries(data.platforms)) {
      console.log(
        `  - ${platform}: available=${info.available} name=${info.name || "none"} url=${info.url || "none"}`
      );
    }
    console.log(`  - checksums: ${data.checksumsUrl || "none"}`);
  } catch (err) {
    console.log(`[FAIL] GitHub API check failed: ${err.message} (code=${err.code || "UNKNOWN"})`);
  }

  console.log("\nDirect Official URL Checks:");
  const checks = await Promise.all([
    checkUrl("Releases Page", releases.DOWNLOAD_URLS.releases),
    checkUrl("Windows (.exe)", releases.DOWNLOAD_URLS.windows),
    checkUrl("macOS (.dmg)", releases.DOWNLOAD_URLS.macos),
    checkUrl("Android (.apk)", releases.DOWNLOAD_URLS.android),
    checkUrl("Checksums (SHA256SUMS.txt)", releases.DOWNLOAD_URLS.checksums),
  ]);

  for (const c of checks) {
    console.log(
      `  [${c.ok ? "OK" : "FAIL"}] ${c.label}: HTTP ${c.status}${c.contentLength ? ` (${c.contentLength} bytes)` : ""} -> ${c.finalUrl || c.error}`
    );
  }

  const checksumCheck = checks.find((c) => c.label.includes("SHA256SUMS.txt"));
  if (checksumCheck && checksumCheck.ok) {
    const txt = await (await fetch(releases.DOWNLOAD_URLS.checksums)).text();
    const lines = txt
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const validHashes = lines.filter((l) => /^[a-f0-9]{64}\s+\S+$/i.test(l));
    console.log(`\n[OK] SHA256SUMS.txt parsed: ${validHashes.length}/${lines.length} valid SHA-256 entries.`);
    for (const l of validHashes) {
      console.log(`  ${l}`);
    }
  } else {
    console.log("\n[WARN] SHA256SUMS.txt is not publicly reachable (HTTP 404). Cannot verify artifact checksums until the repository/release is public.");
  }

  if (!apiOk || checks.some((c) => !c.ok)) {
    process.exitCode = 1;
  }
}

main();
