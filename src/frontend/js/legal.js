// URL path to tab mapping
const pathToTab = {
  "/legal": "terms",
  "/terms": "terms",
  "/privacy": "privacy",
  "/commerce": "commerce",
};

// Tab to URL path mapping
const tabToPath = {
  terms: "/terms",
  privacy: "/privacy",
  commerce: "/commerce",
};

// Get tab ID from current URL path
function getTabFromPath() {
  const path = window.location.pathname;
  return pathToTab[path] || "terms";
}

// Activate a tab by ID
function activateTab(tabId) {
  // Update tab buttons
  document.querySelectorAll(".legal-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  // Update sections
  document.querySelectorAll(".legal-section").forEach((section) => {
    section.classList.toggle("active", section.id === tabId);
  });

  // Update page title
  const titles = {
    terms: "利用規約 - Wedding Smile Catcher",
    privacy: "プライバシーポリシー - Wedding Smile Catcher",
    commerce: "特定商取引法に基づく表記 - Wedding Smile Catcher",
  };
  document.title = titles[tabId] || "Legal - Wedding Smile Catcher";
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  // Activate tab based on current URL
  const initialTab = getTabFromPath();
  activateTab(initialTab);

  // Tab click handlers
  document.querySelectorAll(".legal-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      activateTab(tabId);

      // Update URL without page reload
      const newPath = tabToPath[tabId];
      if (window.location.pathname !== newPath) {
        history.pushState({ tab: tabId }, "", newPath);
      }
    });
  });

  // Handle internal links (e.g., from Terms to Privacy)
  document.querySelectorAll(".internal-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      const tabId = pathToTab[href];
      if (tabId) {
        e.preventDefault();
        activateTab(tabId);
        history.pushState({ tab: tabId }, "", href);
        // Scroll to top of content
        document.querySelector(".legal-main").scrollIntoView({ behavior: "smooth" });
      }
    });
  });
});

// Handle browser back/forward buttons
window.addEventListener("popstate", (e) => {
  const tabId = e.state?.tab || getTabFromPath();
  activateTab(tabId);
});
