import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LANDING_DIR = path.resolve(__dirname, "..");

const releases = require(path.join(LANDING_DIR, "js", "releases.js"));

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
}

test("resolveReleaseAssets extracts verified browser_download_url for all platforms and ignores checksums/blockmaps", () => {
  const payload = {
    tag_name: "v1.3.1",
    published_at: "2026-11-25T20:00:00Z",
    html_url: "https://github.com/gackstone/Institutional-EA/releases/tag/v1.3.1",
    assets: [
      {
        name: "InstitutionalEA-Setup.exe.sha256",
        size: 92,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/InstitutionalEA-Setup.exe.sha256",
      },
      {
        name: "InstitutionalEA-Setup-1.3.1.exe.blockmap",
        size: 204800,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/InstitutionalEA-Setup-1.3.1.exe.blockmap",
      },
      {
        name: "InstitutionalEA-Setup.exe",
        size: 204805028,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/InstitutionalEA-Setup.exe",
      },
      {
        name: "InstitutionalEA.dmg",
        size: 165000000,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/InstitutionalEA.dmg",
      },
      {
        name: "InstitutionalEA.apk",
        size: 48000000,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/InstitutionalEA.apk",
      },
      {
        name: "InstitutionalEA.aab",
        size: 39000000,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/InstitutionalEA.aab",
      },
      {
        name: "SHA256SUMS.txt",
        size: 420,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/SHA256SUMS.txt",
      },
    ],
  };

  const resolved = releases.resolveReleaseAssets(payload);
  assert.equal(resolved.tagName, "v1.3.1");
  assert.equal(resolved.version, "1.3.1");
  assert.equal(resolved.platforms.windows.available, true);
  assert.equal(resolved.platforms.windows.name, "InstitutionalEA-Setup.exe");
  assert.equal(resolved.platforms.macos.available, true);
  assert.equal(resolved.platforms.macos.name, "InstitutionalEA.dmg");
  assert.equal(resolved.platforms.android.available, true);
  assert.equal(resolved.platforms.android.name, "InstitutionalEA.apk");
  assert.equal(resolved.platforms.android.aabName, "InstitutionalEA.aab");
  assert.equal(resolved.platforms.ios.available, false);
  assert.equal(resolved.platforms.ios.url, null);
  assert.equal(
    resolved.checksumsUrl,
    "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.1/SHA256SUMS.txt"
  );
});

test("resolveReleaseAssets enables iOS only when a verified .ipa asset is present", () => {
  const payload = {
    tag_name: "v1.4.0",
    assets: [
      {
        name: "InstitutionalEA-1.4.0.ipa",
        size: 52000000,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.4.0/InstitutionalEA-1.4.0.ipa",
      },
    ],
  };

  const resolved = releases.resolveReleaseAssets(payload);
  assert.equal(resolved.platforms.ios.available, true);
  assert.equal(resolved.platforms.ios.name, "InstitutionalEA-1.4.0.ipa");
  assert.equal(resolved.platforms.windows.available, false);
  assert.equal(resolved.platforms.macos.available, false);
  assert.equal(resolved.platforms.android.available, false);
});

test("fetchLatestRelease retries transient 503 errors, succeeds, and writes cache", async () => {
  const store = new MemoryStorage();
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    if (calls === 1) {
      return { ok: false, status: 503 };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "v1.3.2",
        assets: [
          {
            name: "InstitutionalEA-Setup.exe",
            size: 1000,
            browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/InstitutionalEA-Setup.exe",
          },
        ],
      }),
    };
  };

  const data = await releases.fetchLatestRelease({
    fetchImpl: mockFetch,
    storage: store,
    retryBaseDelayMs: 1,
  });

  assert.equal(calls, 2);
  assert.equal(data.tagName, "v1.3.2");
  const cached = releases.readCache(store);
  assert.equal(cached.isFresh, true);
  assert.equal(cached.data.tagName, "v1.3.2");
});

test("fetchLatestRelease fails immediately without retrying on HTTP 404", async () => {
  let calls = 0;
  const mockFetch = async () => {
    calls++;
    return { ok: false, status: 404 };
  };

  await assert.rejects(
    () => releases.fetchLatestRelease({ fetchImpl: mockFetch, retryBaseDelayMs: 1 }),
    (err) => err.code === "NOT_FOUND" && err.status === 404
  );
  assert.equal(calls, 1);
});

test("resolveReleaseAssets rejects draft and prerelease payloads", () => {
  assert.equal(
    releases.resolveReleaseAssets({ tag_name: "v1.3.2-beta", draft: false, prerelease: true, assets: [] }),
    null
  );
  assert.equal(
    releases.resolveReleaseAssets({ tag_name: "v1.3.2", draft: true, prerelease: false, assets: [] }),
    null
  );
});

test("DOWNLOAD_URLS matches exact official GitHub URLs and buildFallbackRelease marks verified=false", () => {
  assert.equal(
    releases.DOWNLOAD_URLS.windows,
    "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA-Setup.exe"
  );
  assert.equal(
    releases.DOWNLOAD_URLS.macos,
    "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA.dmg"
  );
  assert.equal(
    releases.DOWNLOAD_URLS.android,
    "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA.apk"
  );
  assert.equal(
    releases.DOWNLOAD_URLS.checksums,
    "https://github.com/gackstone/Institutional-EA/releases/latest/download/SHA256SUMS.txt"
  );
  assert.equal(
    releases.DOWNLOAD_URLS.releases,
    "https://github.com/gackstone/Institutional-EA/releases"
  );

  const fallback = releases.buildFallbackRelease("RATE_LIMITED");
  assert.equal(fallback.source, "direct-fallback");
  assert.equal(fallback.verified, false);
  assert.equal(fallback.platforms.windows.url, releases.DOWNLOAD_URLS.windows);
  assert.equal(fallback.platforms.macos.url, releases.DOWNLOAD_URLS.macos);
  assert.equal(fallback.platforms.android.url, releases.DOWNLOAD_URLS.android);
  assert.equal(fallback.platforms.ios.available, false);
  assert.equal(fallback.platforms.ios.url, null);
});

test("Regression: Windows & Android resolver selects canonical installers over older or debug assets appearing first", () => {
  const payload = {
    tag_name: "v1.3.2",
    draft: false,
    prerelease: false,
    assets: [
      {
        name: "setup.exe",
        size: 203844138,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/setup.exe",
      },
      {
        name: "Institutional-EA-Setup-1.3.0.exe",
        size: 203844138,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/Institutional-EA-Setup-1.3.0.exe",
      },
      {
        name: "InstitutionalEA-Setup.exe",
        size: 204805028,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/InstitutionalEA-Setup.exe",
      },
      {
        name: "app-debug.apk",
        size: 50000000,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/app-debug.apk",
      },
      {
        name: "InstitutionalEA.aab",
        size: 26582846,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/InstitutionalEA.aab",
      },
      {
        name: "InstitutionalEA.apk",
        size: 62614507,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/InstitutionalEA.apk",
      },
    ],
  };

  const resolved = releases.resolveReleaseAssets(payload);
  assert.equal(resolved.platforms.windows.name, "InstitutionalEA-Setup.exe");
  assert.equal(resolved.platforms.android.name, "InstitutionalEA.apk");
  assert.equal(resolved.platforms.android.aabName, "InstitutionalEA.aab");

  // Debug-only APK must never be treated as a production release
  const debugOnly = releases.resolveReleaseAssets({
    tag_name: "v1.3.2",
    assets: [
      {
        name: "app-debug.apk",
        size: 50000000,
        browser_download_url: "https://github.com/gackstone/Institutional-EA/releases/download/v1.3.2/app-debug.apk",
      },
    ],
  });
  assert.equal(debugOnly.platforms.android.available, false);
});

test("landing/index.html and landing/js/main.js contain no hardcoded releases/latest/download URLs", () => {
  const html = fs.readFileSync(path.join(LANDING_DIR, "index.html"), "utf8");
  const mainJs = fs.readFileSync(path.join(LANDING_DIR, "js", "main.js"), "utf8");
  assert.equal(html.includes("releases/latest/download/"), false);
  assert.equal(mainJs.includes("releases/latest/download/"), false);
  assert.equal(html.includes('id="release-status"'), false);
  assert.match(html, /js\/releases\.js/);
});

test("Windows SmartScreen help config flag and markup are wired without hardcoded release URLs", () => {
  assert.equal(typeof releases.SHOW_SMARTSCREEN_HELP, "boolean");
  assert.equal(releases.SHOW_SMARTSCREEN_HELP, true);
  const html = fs.readFileSync(path.join(LANDING_DIR, "index.html"), "utf8");
  assert.match(html, /id="windows-install-help"/);
  assert.match(html, /data-smartscreen-help/);
  assert.match(html, /data-win-help-sums/);
});
