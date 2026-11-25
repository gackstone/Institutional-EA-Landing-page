/* ==========================================================================
   Institutional EA — Landing Page Script
   Single source of truth for all external & download links
   ========================================================================== */

const LINKS = {
  releases: "https://github.com/gackstone/Institutional-EA/releases",
  windows: "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA-Setup.exe",
  macos: "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA.dmg",
  android: "https://github.com/gackstone/Institutional-EA/releases/latest/download/InstitutionalEA.apk",
  checksums: "https://github.com/gackstone/Institutional-EA/releases/latest/download/SHA256SUMS.txt",
  github: "https://github.com/gackstone/Institutional-EA",
  ios: null, // Paste the iOS download URL here when available
};

(function () {
  "use strict";

  /**
   * Wire all elements with [data-link] from the LINKS object.
   * Disabled entries (e.g. ios: null) stay non-navigable with aria-disabled="true".
   */
  function wireLinks() {
    const linkElements = document.querySelectorAll("[data-link]");

    linkElements.forEach((el) => {
      const key = el.getAttribute("data-link");
      const url = key && Object.prototype.hasOwnProperty.call(LINKS, key) ? LINKS[key] : null;

      if (typeof url === "string" && url.trim().length > 0) {
        el.setAttribute("href", url.trim());
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
        el.removeAttribute("aria-disabled");
        el.removeAttribute("tabindex");
        el.classList.remove("is-disabled");

        if (key === "ios") {
          const badge = el.querySelector(".store-badge-soon, .badge-soon");
          if (badge) badge.remove();
        }
      } else {
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("tabindex", "-1");
        el.classList.add("is-disabled");
        el.addEventListener("click", (event) => {
          event.preventDefault();
        });
      }
    });
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

    if (!detected || !LINKS[detected]) {
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
    wireLinks();
    highlightDetectedOS();
    initNavigation();
    initDeviceTabs();
    initAccordion();
    initScrollReveal();
  });
})();
