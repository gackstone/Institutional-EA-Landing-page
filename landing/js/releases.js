/* ==========================================================================
   Institutional EA — GitHub Releases Resolver & Client Cache
   Single source of truth: GitHub Releases API (no invented download URLs)
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

  const RELEASES_API_URL =
    "https://api.github.com/repos/gackstone/Institutional-EA/releases/latest";
  const CACHE_KEY = "iea_latest_release_v1";
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const MAX_RETRIES = 2;
  const RETRY_BASE_DELAY_MS = 800;

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

  function pickAsset(assets, extension, preferredPatterns) {
    const candidates = assets.filter((asset) => {
      if (!asset || typeof asset.name !== "string") return false;
      if (!isValidHttpsUrl(asset.browser_download_url)) return false;
      if (isIgnoredArtifact(asset.name)) return false;
      return asset.name.toLowerCase().endsWith(extension);
    });

    if (candidates.length === 0) return null;

    for (const pattern of preferredPatterns) {
      const match = candidates.find((a) => pattern.test(a.name));
      if (match) return match;
    }

    return candidates[0];
  }

  function toPlatformEntry(asset) {
    if (!asset) {
      return { available: false, url: null, name: null, size: null };
    }
    return {
      available: true,
      url: asset.browser_download_url.trim(),
      name: asset.name,
      size: typeof asset.size === "number" ? asset.size : null,
    };
  }

  /**
   * Parse a GitHub Release API payload into verified platform download entries.
   * Never invents URLs — only uses actual browser_download_url values from GitHub.
   */
  function resolveReleaseAssets(release) {
    if (!release || typeof release !== "object" || !Array.isArray(release.assets)) {
      return null;
    }

    const assets = release.assets;
    const tagName = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
    const version = tagName.replace(/^v/i, "");
    const publishedAt =
      typeof release.published_at === "string" ? release.published_at : null;
    const htmlUrl = isValidHttpsUrl(release.html_url) ? release.html_url.trim() : null;

    const winAsset = pickAsset(assets, ".exe", [
      /^InstitutionalEA-Setup\.exe$/i,
      /^InstitutionalEA-Setup-[\d.]+\.exe$/i,
      /setup.*\.exe$/i,
    ]);

    const macAsset = pickAsset(assets, ".dmg", [
      /^InstitutionalEA\.dmg$/i,
      /^InstitutionalEA-[\d.]+\.dmg$/i,
    ]);

    const androidApkAsset = pickAsset(assets, ".apk", [
      /^InstitutionalEA\.apk$/i,
      /^InstitutionalEA-[\d.]+\.apk$/i,
    ]);

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
      tagName: tagName || null,
      version: version || null,
      publishedAt,
      htmlUrl,
      checksumsUrl: checksumsAsset ? checksumsAsset.browser_download_url.trim() : null,
      platforms: {
        windows: toPlatformEntry(winAsset),
        macos: toPlatformEntry(macAsset),
        android: {
          ...toPlatformEntry(androidApkAsset),
          aabUrl: androidAabAsset ? androidAabAsset.browser_download_url.trim() : null,
          aabName: androidAabAsset ? androidAabAsset.name : null,
        },
        ios: toPlatformEntry(iosIpaAsset),
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
   * Fetch latest GitHub Release with automatic retry on transient errors.
   * Does not retry on 404 (no public release) or 403 (rate limit).
   */
  async function fetchLatestRelease(options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || (typeof fetch === "function" ? fetch : null);
    const apiUrl = opts.apiUrl || RELEASES_API_URL;
    const maxRetries = typeof opts.maxRetries === "number" ? opts.maxRetries : MAX_RETRIES;
    const retryBaseDelayMs =
      typeof opts.retryBaseDelayMs === "number" ? opts.retryBaseDelayMs : RETRY_BASE_DELAY_MS;

    if (!fetchImpl) {
      throw new Error("Fetch API is unavailable in this environment.");
    }

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetchImpl(apiUrl, {
          headers: {
            Accept: "application/vnd.github+json",
          },
          cache: "no-cache",
        });

        if (response.ok) {
          const payload = await response.json();
          const resolved = resolveReleaseAssets(payload);
          if (!resolved) {
            const parseErr = new Error("Unexpected release payload from GitHub.");
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
        lastError = err;
      } catch (err) {
        if (err && (err.code === "NOT_FOUND" || err.code === "RATE_LIMITED" || err.code === "INVALID_PAYLOAD")) {
          throw err;
        }
        lastError = err;
      }

      if (attempt < maxRetries) {
        await sleep(retryBaseDelayMs * Math.pow(2, attempt));
      }
    }

    throw lastError || new Error("Unable to reach GitHub Releases API.");
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
    RELEASES_API_URL,
    CACHE_KEY,
    CACHE_TTL_MS,
    resolveReleaseAssets,
    fetchLatestRelease,
    readCache,
    writeCache,
    formatBytes,
    formatPublishedDate,
  };
});
