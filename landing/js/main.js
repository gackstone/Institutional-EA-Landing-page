/* ==========================================================================
   Institutional EA — Landing Page Script
   Dynamic GitHub Releases integration + navigation, tabs, FAQ & animations
   ========================================================================== */

const STATIC_LINKS = {
  whatsapp: "https://wa.me/254712052104",
};

const PLATFORM_KEYS = ["windows", "macos", "android", "ios"];

const PLATFORM_EXT_LABELS = {
  windows: ".exe",
  macos: ".dmg",
  android: ".apk",
  ios: ".ipa",
};

(function () {
  "use strict";

  let activePlatformUrls = {
    windows: null,
    macos: null,
    android: null,
    ios: null,
  };

  function preventDisabledClick(event) {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  }

  /**
   * Wire static links (e.g., WhatsApp Support) immediately on page load.
   */
  function wireStaticLinks() {
    document.querySelectorAll('[data-link="whatsapp"]').forEach((el) => {
      el.setAttribute("href", STATIC_LINKS.whatsapp);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    });

    PLATFORM_KEYS.forEach((platform) => {
      document.querySelectorAll(`[data-link="${platform}"]`).forEach((el) => {
        el.addEventListener("click", preventDisabledClick);
      });
    });
  }

  function ensureBadge(el, text, isDropdown) {
    const cls = isDropdown ? "badge-soon" : "store-badge-soon";
    let badge = el.querySelector(`.${cls}`);
    if (!badge) {
      badge = document.createElement("span");
      badge.className = cls;
      el.appendChild(badge);
    }
    badge.textContent = text;
  }

  function removeBadge(el, isDropdown) {
    const cls = isDropdown ? "badge-soon" : "store-badge-soon";
    const badge = el.querySelector(`.${cls}`);
    if (badge) badge.remove();
  }

  /**
   * Put platform download elements into a clean loading state while querying GitHub.
   */
  function setPlatformsLoading() {
    PLATFORM_KEYS.forEach((platform) => {
      document.querySelectorAll(`[data-link="${platform}"]`).forEach((el) => {
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("aria-busy", "true");
        el.setAttribute("tabindex", "-1");
        el.classList.add("is-disabled", "is-loading");
        el.classList.remove("is-detected-os");
      });
    });
  }

  /**
   * Apply verified GitHub Release platform entries to every download button & dropdown item.
   */
  function applyReleaseToUI(release) {
    const releasesApi = window.IEAReleases;
    const platforms = release && release.platforms ? release.platforms : {};

    PLATFORM_KEYS.forEach((platform) => {
      const entry = platforms[platform] || { available: false, url: null, name: null, size: null };
      const isAvailable = Boolean(entry.available && entry.url);
      activePlatformUrls[platform] = isAvailable ? entry.url : null;

      document.querySelectorAll(`[data-link="${platform}"]`).forEach((el) => {
        const isDropdown = el.classList.contains("dropdown-item");
        el.removeAttribute("aria-busy");
        el.classList.remove("is-loading");

        if (isAvailable) {
          el.setAttribute("href", entry.url);
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
          el.removeAttribute("aria-disabled");
          el.removeAttribute("tabindex");
          el.classList.remove("is-disabled");

          const sizeText = releasesApi ? releasesApi.formatBytes(entry.size) : "";
          const versionTag = release && release.tagName ? ` ${release.tagName}` : "";
          el.setAttribute(
            "title",
            `Download ${entry.name || platform}${versionTag}${sizeText ? ` (${sizeText})` : ""}`
          );

          removeBadge(el, isDropdown);

          if (isDropdown) {
            let meta = el.querySelector(".dropdown-meta");
            if (!meta) {
              meta = document.createElement("span");
              meta.className = "dropdown-meta";
              el.appendChild(meta);
            }
            meta.textContent = PLATFORM_EXT_LABELS[platform];
          }
        } else {
          el.removeAttribute("href");
          el.removeAttribute("target");
          el.removeAttribute("rel");
          el.setAttribute("aria-disabled", "true");
          el.setAttribute("tabindex", "-1");
          el.classList.add("is-disabled");
          el.classList.remove("is-detected-os");

          const unavailableLabel = platform === "ios" ? "Coming soon" : "Unavailable";
          el.setAttribute(
            "title",
            platform === "ios"
              ? "iOS build is coming soon"
              : "No published installer is currently available for this platform"
          );

          if (isDropdown) {
            const meta = el.querySelector(".dropdown-meta");
            if (meta) meta.remove();
          }
          ensureBadge(el, unavailableLabel, isDropdown);
        }
      });
    });

    highlightDetectedOS();
  }

  /**
   * Render subtle, unobtrusive release version & availability status beneath hero buttons.
   */
  function renderReleaseStatus(state, payload) {
    const statusEl = document.getElementById("release-status");
    if (!statusEl) return;

    statusEl.innerHTML = "";
    statusEl.className = `release-status is-${state}`;

    const dot = document.createElement("span");
    dot.className = "release-status-dot";
    dot.setAttribute("aria-hidden", "true");
    statusEl.appendChild(dot);

    const text = document.createElement("span");
    text.className = "release-status-text";

    if (state === "loading") {
      text.textContent = "Checking latest release…";
      statusEl.appendChild(text);
      return;
    }

    if (state === "ready" && payload) {
      const releasesApi = window.IEAReleases;
      const versionLabel = payload.tagName || (payload.version ? `v${payload.version}` : "Latest release");
      const dateStr = releasesApi ? releasesApi.formatPublishedDate(payload.publishedAt) : "";
      const availableCount = PLATFORM_KEYS.filter(
        (k) => payload.platforms && payload.platforms[k] && payload.platforms[k].available
      ).length;

      if (availableCount === 0) {
        statusEl.className = "release-status is-error";
        text.textContent = `Release ${versionLabel} has no downloadable installers yet.`;
        statusEl.appendChild(text);
        return;
      }

      text.textContent = dateStr
        ? `Latest release ${versionLabel} · Updated ${dateStr}`
        : `Latest release ${versionLabel}`;
      statusEl.appendChild(text);

      if (payload.checksumsUrl) {
        const sep = document.createElement("span");
        sep.className = "release-status-sep";
        sep.textContent = "·";
        sep.setAttribute("aria-hidden", "true");
        statusEl.appendChild(sep);

        const link = document.createElement("a");
        link.className = "release-status-link";
        link.href = payload.checksumsUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "SHA-256";
        statusEl.appendChild(link);
      }
      return;
    }

    // Error / Unavailable state
    const err = payload || {};
    if (err.code === "NOT_FOUND") {
      text.textContent = "Latest release is currently unavailable on GitHub.";
    } else if (err.code === "RATE_LIMITED") {
      text.textContent = "GitHub release check temporarily rate-limited.";
    } else {
      text.textContent = "Unable to load latest release right now.";
    }
    statusEl.appendChild(text);

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "release-retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      loadLatestRelease({ forceRefresh: true });
    });
    statusEl.appendChild(retryBtn);
  }

  /**
   * Fetch & hydrate latest GitHub Release with stale-while-revalidate caching.
   */
  async function loadLatestRelease(options) {
    const opts = options || {};
    const releasesApi = window.IEAReleases;
    if (!releasesApi) return;

    const cached = !opts.forceRefresh ? releasesApi.readCache() : null;

    if (cached && cached.data) {
      applyReleaseToUI(cached.data);
      renderReleaseStatus("ready", cached.data);
      if (cached.isFresh) {
        return;
      }
    } else {
      setPlatformsLoading();
      renderReleaseStatus("loading");
    }

    try {
      const fresh = await releasesApi.fetchLatestRelease();
      applyReleaseToUI(fresh);
      renderReleaseStatus("ready", fresh);
    } catch (err) {
      if (cached && cached.data) {
        // Keep previously verified cached links usable if revalidation fails transiently
        return;
      }
      applyReleaseToUI(null);
      renderReleaseStatus("error", err);
    }
  }

  /**
   * Detect visitor OS locally via navigator.userAgent (no tracking)
   * and highlight the matching active download button.
   */
  function highlightDetectedOS() {
    const ua = (navigator.userAgent || "").toLowerCase();
    let detected = null;

    if (ua.includes("android")) {
      detected = "android";
    } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
      detected = "ios";
    } else if (ua.includes("win")) {
      detected = "windows";
    } else if (ua.includes("mac")) {
      detected = "macos";
    }

    document.querySelectorAll("[data-os]").forEach((el) => {
      el.classList.remove("is-detected-os");
    });

    if (!detected || !activePlatformUrls[detected]) {
      return;
    }

    const targets = document.querySelectorAll(`[data-os="${detected}"]`);
    targets.forEach((el) => {
      if (el.getAttribute("aria-disabled") !== "true") {
        el.classList.add("is-detected-os");
      }
    });
  }

  /**
   * Mobile menu & Platforms dropdown
   */
  function initNavigation() {
    const menuToggle = document.getElementById("menu-toggle");
    const mainNav = document.getElementById("main-nav");
    const dropdown = document.querySelector("[data-dropdown]");
    const dropdownTrigger = dropdown ? dropdown.querySelector(".dropdown-trigger") : null;

    function closeDropdown() {
      if (!dropdown || !dropdownTrigger) return;
      dropdown.classList.remove("is-open");
      dropdownTrigger.setAttribute("aria-expanded", "false");
    }

    function closeMobileMenu() {
      if (!menuToggle || !mainNav) return;
      mainNav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    }

    if (menuToggle && mainNav) {
      menuToggle.addEventListener("click", () => {
        const isOpen = mainNav.classList.toggle("is-open");
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        if (!isOpen) closeDropdown();
      });

      mainNav.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", () => {
          closeMobileMenu();
          closeDropdown();
        });
      });
    }

    if (dropdown && dropdownTrigger) {
      dropdownTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = dropdown.classList.toggle("is-open");
        dropdownTrigger.setAttribute("aria-expanded", String(isOpen));
      });

      document.addEventListener("click", (event) => {
        if (!dropdown.contains(event.target)) {
          closeDropdown();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeDropdown();
          closeMobileMenu();
        }
      });
    }
  }

  /**
   * Accessible Desktop | Mobile tab switcher
   */
  function initDeviceTabs() {
    const tabs = Array.from(document.querySelectorAll(".device-tab"));
    if (tabs.length === 0) return;

    function activateTab(selectedTab, moveFocus) {
      tabs.forEach((tab) => {
        const isSelected = tab === selectedTab;
        const panelId = tab.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;

        tab.classList.toggle("is-active", isSelected);
        tab.setAttribute("aria-selected", String(isSelected));
        tab.setAttribute("tabindex", isSelected ? "0" : "-1");

        if (panel) {
          panel.hidden = !isSelected;
          panel.classList.toggle("is-active", isSelected);
        }
      });

      if (moveFocus) {
        selectedTab.focus();
      }
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateTab(tab, false));

      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        }

        if (nextIndex !== null) {
          event.preventDefault();
          activateTab(tabs[nextIndex], true);
        }
      });
    });
  }

  /**
   * Accessible FAQ accordion
   */
  function initAccordion() {
    const triggers = document.querySelectorAll(".faq-trigger");

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const expanded = trigger.getAttribute("aria-expanded") === "true";
        const panelId = trigger.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;

        trigger.setAttribute("aria-expanded", String(!expanded));
        if (panel) {
          panel.hidden = expanded;
        }
      });
    });
  }

  /**
   * Subtle scroll-reveal animations using IntersectionObserver
   */
  function initScrollReveal() {
    const items = document.querySelectorAll(".reveal");
    if (items.length === 0) return;

    const prefersReduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || !("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -30px 0px" }
    );

    items.forEach((item) => observer.observe(item));
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireStaticLinks();
    initNavigation();
    initDeviceTabs();
    initAccordion();
    initScrollReveal();
    loadLatestRelease();
  });
})();
