/* ==========================================================================
   Institutional EA — GitHub Releases Resolver, Verified Fallback & Cache
   Primary: GitHub Releases API (latest published stable release)
   Fallback: Exact official GitHub download URLs on transient API errors only
   Works in both browser (window.IEAReleases) and Node.js tests (module exports)
   ========================================================================== */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.IEAReleases = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REPO_OWNER = "gackstone";
  const REPO_NAME = "Institutional-EA";
  const RELEASES_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

  const DOWNLOAD_URLS = Object.freeze({
    windows:
      "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA-Setup.exe",
    macos:
      "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA.dmg",
    android:
      "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA.apk",
    checksums:
      "https://github.com/gackstone/Institutional-EA/releases/latest/download/SHA256SUMS.txt",
    releases:
      "https://github.com/gackstone/Institutional-EA/releases",
  });

  const CACHE_KEY = "iea_latest_release_v4";
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for fast release propagation

  const ANDROID_RELEASE_META = Object.freeze({
    version: "1.3.5",
    tagName: "v1.3.5",
    sizeLabel: "77.1 MB",
    sizeBytes: 80848623,
    minSdk: "Android 7.0+ (API 24)",
    updatedDate: "Nov 26, 2026",
    sha256: "c7c10b8df02bc28f697c0099cc471bb82d1600610c9405fadbb6fd04d6ca7d17",
    downloadUrl: DOWNLOAD_URLS.android,
    upgradeNote:
      "If you have an older version installed, uninstall v1.3.4 first before installing v1.3.5 (one-time signing key upgrade); future updates install directly over it (you may need to allow installs from this source).",
  });
  const MAX_RETRIES = 2;
  const RETRY_BASE_DELAY_MS = 800;
  const REQUEST_TIMEOUT_MS = 10000;

  const IGNORED_SUFFIXES = [
    ".sha256",
    ".sha512",
    ".sig",
    ".asc",
    ".blockmap",
    ".yml",
    ".yaml",
    ".txt",
  ];

  function isValidHttpsUrl(value) {
    return typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value.trim());
  }

  function isIgnoredArtifact(name) {
    const lower = String(name || "").toLowerCase();
    return IGNORED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
  }

  function pickAsset(assets, extension, preferredPatterns, excludePatterns) {
    const excludes = Array.isArray(excludePatterns) ? excludePatterns : [];
    const candidates = assets.filter((asset) => {
      if (!asset || typeof asset.name !== "string") return false;
      if (!isValidHttpsUrl(asset.browser_download_url)) return false;
      if (isIgnoredArtifact(asset.name)) return false;
      if (excludes.some((re) => re.test(asset.name))) return false;
      return asset.name.toLowerCase().endsWith(extension);
    });

    if (candidates.length === 0) return null;

    for (const pattern of preferredPatterns) {
      const match = candidates.find((a) => pattern.test(a.name));
      if (match) return match;
    }

    return candidates[0];
  }

  function toPlatformEntry(asset, verified) {
    if (!asset) {
      return { available: false, verified: false, url: null, name: null, size: null };
    }
    return {
      available: true,
      verified: Boolean(verified),
      url: asset.browser_download_url.trim(),
      name: asset.name,
      size: typeof asset.size === "number" ? asset.size : null,
    };
  }

  /**
   * Parse a GitHub Release API payload into per-platform verified download entries.
   * Excludes drafts and prereleases; never invents URLs for missing assets.
   */
  function resolveReleaseAssets(release) {
    if (!release || typeof release !== "object" || !Array.isArray(release.assets)) {
      return null;
    }
    if (release.draft === true || release.prerelease === true) {
      return null;
    }

    const assets = release.assets;
    const tagName = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
    const version = tagName.replace(/^v/i, "");
    const publishedAt =
      typeof release.published_at === "string" ? release.published_at : null;
    const htmlUrl = isValidHttpsUrl(release.html_url)
      ? release.html_url.trim()
      : DOWNLOAD_URLS.releases;

    const winAsset = pickAsset(assets, ".exe", [
      /^InstitutionalEA-Setup\.exe$/i,
      /^InstitutionalEA-Setup-[\d.]+\.exe$/i,
      /setup.*\.exe$/i,
    ]);

    const macAsset = pickAsset(assets, ".dmg", [
      /^InstitutionalEA\.dmg$/i,
      /^InstitutionalEA-[\d.]+\.dmg$/i,
    ]);

    const androidApkAsset = pickAsset(
      assets,
      ".apk",
      [/^InstitutionalEA\.apk$/i, /^InstitutionalEA-[\d.]+\.apk$/i],
      [/debug/i]
    );

    const androidAabAsset = pickAsset(assets, ".aab", [
      /^InstitutionalEA\.aab$/i,
      /^InstitutionalEA-[\d.]+\.aab$/i,
    ]);

    const iosIpaAsset = pickAsset(assets, ".ipa", [
      /^InstitutionalEA\.ipa$/i,
      /^InstitutionalEA-[\d.]+\.ipa$/i,
    ]);

    const checksumsAsset = assets.find(
      (a) =>
        a &&
        typeof a.name === "string" &&
        /^SHA256SUMS\.txt$/i.test(a.name) &&
        isValidHttpsUrl(a.browser_download_url)
    );

    return {
      source: "github-api",
      verified: true,
      tagName: tagName || null,
      version: version || null,
      publishedAt,
      htmlUrl,
      checksumsUrl: checksumsAsset ? checksumsAsset.browser_download_url.trim() : null,
      platforms: {
        windows: toPlatformEntry(winAsset, true),
        macos: toPlatformEntry(macAsset, true),
        android: {
          ...toPlatformEntry(androidApkAsset, true),
          aabUrl: androidAabAsset ? androidAabAsset.browser_download_url.trim() : null,
          aabName: androidAabAsset ? androidAabAsset.name : null,
        },
        ios: toPlatformEntry(iosIpaAsset, true),
      },
    };
  }

  /**
   * Build the official direct-URL fallback structure used ONLY when the GitHub API
   * is temporarily unavailable (rate limit / 5xx / network outage), never on 404.
   * Explicitly marks entries as verified: false so UI distinguishes fallback from live API.
   */
  function buildFallbackRelease(reasonCode) {
    return {
      source: "direct-fallback",
      verified: false,
      fallbackReason: reasonCode || "API_UNAVAILABLE",
      tagName: null,
      version: null,
      publishedAt: null,
      htmlUrl: DOWNLOAD_URLS.releases,
      checksumsUrl: DOWNLOAD_URLS.checksums,
      platforms: {
        windows: {
          available: true,
          verified: false,
          url: DOWNLOAD_URLS.windows,
          name: "InstitutionalEA-Setup.exe",
          size: null,
        },
        macos: {
          available: true,
          verified: false,
          url: DOWNLOAD_URLS.macos,
          name: "InstitutionalEA.dmg",
          size: null,
        },
        android: {
          available: true,
          verified: false,
          url: DOWNLOAD_URLS.android,
          name: "InstitutionalEA.apk",
          size: null,
          aabUrl: null,
          aabName: null,
        },
        ios: {
          available: false,
          verified: false,
          url: null,
          name: null,
          size: null,
        },
      },
    };
  }

  function getStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage;
      }
    } catch (_) {
      // Ignore storage restrictions
    }
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return window.sessionStorage;
      }
    } catch (_) {
      // Ignore storage restrictions
    }
    return null;
  }

  function readCache(storageOverride) {
    const store = storageOverride || getStorage();
    if (!store) return null;
    try {
      const raw = store.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.cachedAt !== "number" || !parsed.data) {
        return null;
      }
      const age = Date.now() - parsed.cachedAt;
      return {
        data: parsed.data,
        isFresh: age >= 0 && age < CACHE_TTL_MS,
        ageMs: age,
      };
    } catch (_) {
      return null;
    }
  }

  function writeCache(data, storageOverride) {
    const store = storageOverride || getStorage();
    if (!store) return;
    try {
      store.setItem(CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }));
    } catch (_) {
      // Ignore quota/private-mode errors
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch latest stable GitHub Release with automatic retry on transient errors.
   * Does not retry on 404 (no public release / private repo) or 403/429 (rate limit).
   */
  async function fetchLatestRelease(options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    const apiUrl = opts.apiUrl || RELEASES_API_URL;
    const maxRetries = typeof opts.maxRetries === "number" ? opts.maxRetries : MAX_RETRIES;
    const retryBaseDelayMs =
      typeof opts.retryBaseDelayMs === "number" ? opts.retryBaseDelayMs : RETRY_BASE_DELAY_MS;

    if (!fetchImpl) {
      const err = new Error("Fetch API is unavailable in this environment.");
      err.code = "NETWORK_ERROR";
      throw err;
    }

    let lastError = null;

    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : REQUEST_TIMEOUT_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let timerId = null;
      try {
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        if (controller && timeoutMs > 0) {
          timerId = setTimeout(() => controller.abort(), timeoutMs);
        }
        const response = await fetchImpl(apiUrl, {
          headers: {
            Accept: "application/vnd.github+json",
          },
          cache: "no-cache",
          signal: controller ? controller.signal : undefined,
        });
        if (timerId) clearTimeout(timerId);

        if (response.ok) {
          const payload = await response.json();
          const resolved = resolveReleaseAssets(payload);
          if (!resolved) {
            const parseErr = new Error("No published stable release found in GitHub API response.");
            parseErr.code = "INVALID_PAYLOAD";
            throw parseErr;
          }
          writeCache(resolved, opts.storage);
          return resolved;
        }

        const err = new Error(`GitHub API responded with HTTP ${response.status}`);
        err.status = response.status;
        if (response.status === 404) {
          err.code = "NOT_FOUND";
          throw err;
        }
        if (response.status === 403 || response.status === 429) {
          err.code = "RATE_LIMITED";
          throw err;
        }
        err.code = "API_ERROR";
        lastError = err;
      } catch (err) {
        if (timerId) clearTimeout(timerId);
        if (
          err &&
          (err.code === "NOT_FOUND" ||
            err.code === "RATE_LIMITED" ||
            err.code === "INVALID_PAYLOAD")
        ) {
          throw err;
        }
        if (err && !err.code) {
          err.code = err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR";
        }
        lastError = err;
      }

      if (attempt < maxRetries) {
        await sleep(retryBaseDelayMs * Math.pow(2, attempt));
      }
    }

    throw lastError || Object.assign(new Error("Unable to reach GitHub Releases API."), { code: "NETWORK_ERROR" });
  }

  function formatBytes(bytes) {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
      return "";
    }
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  function formatPublishedDate(isoDate) {
    if (!isoDate) return "";
    try {
      const d = new Date(isoDate);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (_) {
      return "";
    }
  }

  return {
    REPO_OWNER,
    REPO_NAME,
    RELEASES_API_URL,
    DOWNLOAD_URLS,
    ANDROID_RELEASE_META,
    CACHE_KEY,
    CACHE_TTL_MS,
    resolveReleaseAssets,
    buildFallbackRelease,
    fetchLatestRelease,
    readCache,
    writeCache,
    formatBytes,
    formatPublishedDate,
  };
});
