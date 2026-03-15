/**
 * Admin panel entry point.
 * Handles authentication, tab switching, and orchestrates all tab modules.
 */

import {
  getCountFromServer,
  collection,
  query,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { db, auth } from "../firebase-init.js";
import { showToast } from "../utils.js";
import {
  selectedItems,
  currentTab,
  setCurrentTab,
  currentEventFilter,
  setCurrentEventFilter,
  isAdminUser,
  setIsAdminUser,
  currentUser,
  setCurrentUser,
  currentApplicationId,
  imagesTable,
  setImagesTable,
  usersTable,
  setUsersTable,
  imagesDataCache,
  setImagesDataCache,
  usersDataCache,
  setUsersDataCache,
  applicationsDataCache,
  setApplicationsDataCache,
  updateSelectionCount,
  showConfirmModal,
  resolvePendingAction,
} from "./state.js";

import { loadImages, updateEventFilter, downloadSelectedImages } from "./images.js";
import { loadUsers } from "./users.js";
import {
  loadEvents,
  hardDeleteEvent,
  selectAllEvents,
  setDefaultEventDate,
  createEvent,
  downloadQRCode,
  copyToClipboard,
} from "./events.js";
import {
  loadApplications,
  filterApplications,
  showApplicationDetail,
  createEventFromApplication,
  rejectApplication,
} from "./applications.js";
import { loadAccounts } from "./accounts.js";
import { loadStatistics } from "./statistics.js";

// --- Auth helpers ---

async function checkAdminStatus() {
  if (!currentUser) {
    setIsAdminUser(false);
    return false;
  }
  try {
    const accountRef = doc(db, "accounts", currentUser.uid);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      setIsAdminUser(accountSnap.data().is_admin === true);
    } else {
      setIsAdminUser(false);
    }
    return isAdminUser;
  } catch (error) {
    console.error("Error checking admin status:", error);
    setIsAdminUser(false);
    return false;
  }
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.style.display = "none";
  });
  document.getElementById(screenId).style.display = "block";
}

function showError(message) {
  const errorDiv = document.getElementById("loginError");
  errorDiv.textContent = message;
}

// --- Stats ---

async function loadStats() {
  try {
    const imagesQuery = query(collection(db, "images"));
    const usersQuery = query(collection(db, "users"));
    const eventsQuery = query(collection(db, "events"));

    const [imagesSnapshot, usersSnapshot, eventsSnapshot] = await Promise.all([
      getCountFromServer(imagesQuery),
      getCountFromServer(usersQuery),
      getCountFromServer(eventsQuery),
    ]);

    document.getElementById("totalImages").textContent =
      imagesSnapshot.data().count;
    document.getElementById("totalUsers").textContent =
      usersSnapshot.data().count;
    document.getElementById("totalEvents").textContent =
      eventsSnapshot.data().count;
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

// --- Tab switching ---

function switchTab(tabName) {
  setCurrentTab(tabName);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });
  document.getElementById(`${tabName}Tab`).classList.add("active");

  if (tabName === "images") loadImages();
  if (tabName === "users") loadUsers();
  if (tabName === "events") loadEvents();
  if (tabName === "applications") loadApplications();
  if (tabName === "accounts") loadAccounts();
  if (tabName === "statistics") loadStatistics();
}

// --- Bulk delete ---

async function deleteSelected(type) {
  const count = selectedItems[type].size;
  if (count === 0) return;

  const confirmed = await showConfirmModal(type, count);
  if (!confirmed) return;

  try {
    const ids = Array.from(selectedItems[type]);

    if (type === "events") {
      for (const eventId of ids) {
        await hardDeleteEvent(eventId);
      }
    } else {
      const collectionName = type;
      const batchSize = 500;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = ids.slice(i, i + batchSize);

        chunk.forEach((id) => {
          const docRef = doc(db, collectionName, id);
          batch.delete(docRef);
        });

        await batch.commit();
      }
    }

    selectedItems[type].clear();

    if (type === "images") {
      setImagesTable(null);
      setImagesDataCache(null);
      await loadImages(true);
    }
    if (type === "users") {
      setUsersTable(null);
      setUsersDataCache(null);
      await loadUsers(true);
    }
    if (type === "events") await loadEvents();

    await loadStats();

    showToast(`Successfully deleted ${count} ${type}`, "success");
  } catch (error) {
    console.error("Error deleting items:", error);
    showToast(`Error deleting ${type}: ${error.message}`, "error", 5000);
  }
}

// =========================
// DOM Event Listeners
// =========================

// Auth tab switching
document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".auth-tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    document
      .querySelectorAll(".auth-form")
      .forEach((f) => f.classList.remove("active"));
    const tabName = btn.dataset.authTab;
    const form = document.getElementById(
      tabName === "login" ? "loginForm" : "registerForm"
    );
    form.classList.add("active");
    showError("");
  });
});

// Terms of Service link
document.getElementById("termsLink").addEventListener("click", (e) => {
  e.preventDefault();
  window.open("/terms", "_blank");
});

// Login form handler
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Login failed:", error);
    if (
      error.code === "auth/invalid-credential" ||
      error.code === "auth/wrong-password" ||
      error.code === "auth/user-not-found"
    ) {
      showError("Invalid email or password");
    } else {
      showError("Login failed: " + error.message);
    }
  }
});

// Registration form handler
document
  .getElementById("registerForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("regEmailInput").value;
    const password = document.getElementById("regPasswordInput").value;
    const displayName = document
      .getElementById("regDisplayNameInput")
      .value.trim();
    const termsChecked = document.getElementById("regTermsCheckbox").checked;

    if (!termsChecked) {
      showError("Please agree to the Terms of Service.");
      return;
    }

    if (!displayName || displayName.length > 50) {
      showError("Display name must be 1-50 characters.");
      return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    showError("");

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      await setDoc(doc(db, "accounts", user.uid), {
        email: email,
        display_name: displayName,
        created_at: serverTimestamp(),
        terms_accepted_at: serverTimestamp(),
        status: "active",
      });
    } catch (error) {
      console.error("Registration failed:", error);
      if (error.code === "auth/email-already-in-use") {
        showError("This email is already registered.");
      } else if (error.code === "auth/weak-password") {
        showError("Password must be at least 8 characters.");
      } else if (error.code === "auth/invalid-email") {
        showError("Invalid email address.");
      } else {
        showError("Registration failed: " + error.message);
      }
    } finally {
      submitBtn.disabled = false;
    }
  });

// Event creation toggle
document.getElementById("eventCreateToggle").addEventListener("click", () => {
  const form = document.getElementById("eventCreateForm");
  const toggle = document.getElementById("eventCreateToggle");
  const isHidden = form.style.display === "none";
  form.style.display = isHidden ? "block" : "none";
  toggle.classList.toggle("open", isHidden);
});

// Event creation form handler
document
  .getElementById("eventCreateForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    await createEvent();
    await loadStats();
  });

// Refresh buttons
document
  .getElementById("refreshEvents")
  .addEventListener("click", () => loadEvents());
document
  .getElementById("showArchivedEvents")
  .addEventListener("change", () => loadEvents());
document
  .getElementById("refreshAccounts")
  .addEventListener("click", () => loadAccounts(true));

// Applications tab
document
  .getElementById("refreshApplications")
  .addEventListener("click", () => {
    setApplicationsDataCache(null);
    loadApplications(true);
  });

document
  .getElementById("showProcessedApplications")
  .addEventListener("change", () => {
    filterApplications();
  });

// Application modal
document
  .getElementById("closeApplicationModal")
  .addEventListener("click", () => {
    document.getElementById("applicationModal").classList.remove("show");
  });
document
  .getElementById("closeApplicationModalBtn")
  .addEventListener("click", () => {
    document.getElementById("applicationModal").classList.remove("show");
  });
document
  .getElementById("createEventFromApplication")
  .addEventListener("click", () => {
    if (currentApplicationId) {
      createEventFromApplication(currentApplicationId);
    }
  });
document
  .getElementById("rejectApplication")
  .addEventListener("click", () => {
    if (currentApplicationId) {
      rejectApplication(currentApplicationId);
    }
  });

// Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
  }
});

// Tab buttons
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// Images tab actions
document
  .getElementById("refreshImages")
  .addEventListener("click", () => loadImages(true));
document
  .getElementById("refreshUsers")
  .addEventListener("click", () => loadUsers(true));

document.getElementById("selectAllImages").addEventListener("click", () => {
  if (imagesTable) {
    const allSelected =
      imagesTable.getSelectedData().length === imagesTable.getData().length;
    if (allSelected) {
      imagesTable.deselectRow();
    } else {
      imagesTable.selectRow();
    }
  }
});
document.getElementById("selectAllUsers").addEventListener("click", () => {
  if (usersTable) {
    const allSelected =
      usersTable.getSelectedData().length === usersTable.getData().length;
    if (allSelected) {
      usersTable.deselectRow();
    } else {
      usersTable.selectRow();
    }
  }
});
document
  .getElementById("selectAllEvents")
  .addEventListener("click", () => selectAllEvents());

// Delete buttons
document
  .getElementById("deleteSelectedImages")
  .addEventListener("click", () => deleteSelected("images"));
document
  .getElementById("deleteSelectedUsers")
  .addEventListener("click", () => deleteSelected("users"));
document
  .getElementById("deleteSelectedEvents")
  .addEventListener("click", () => deleteSelected("events"));

// Download images
document
  .getElementById("downloadSelectedImages")
  .addEventListener("click", () => downloadSelectedImages());

// Statistics
document
  .getElementById("refreshStats")
  .addEventListener("click", () => loadStatistics());
document.getElementById("statsEventFilter").addEventListener("change", () => {
  loadStatistics();
});

// Event filter for images
document.getElementById("eventFilter").addEventListener("change", (e) => {
  setCurrentEventFilter(e.target.value);
  updateEventFilter();
});

// QR Modal
document.getElementById("closeQRModal").addEventListener("click", () => {
  document.getElementById("qrModal").classList.remove("show");
});
document.getElementById("qrModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove("show");
  }
});
document.getElementById("downloadQRBtn").addEventListener("click", () => {
  downloadQRCode();
});
document.getElementById("copyDeepLinkBtn").addEventListener("click", () => {
  const url = document.getElementById("qrDeepLinkUrl").textContent;
  copyToClipboard(url);
});

// Confirm modal
document.getElementById("confirmDelete").addEventListener("click", () => {
  resolvePendingAction(true);
});
document.getElementById("cancelDelete").addEventListener("click", () => {
  resolvePendingAction(false);
});

// Close status dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".status-dropdown-wrapper")) {
    document.querySelectorAll(".status-dropdown").forEach((d) => {
      d.classList.add("hidden");
    });
  }
});

// =========================
// Firebase Auth state listener
// =========================

onAuthStateChanged(auth, async (user) => {
  if (user) {
    setCurrentUser(user);

    const isAdmin = await checkAdminStatus();
    if (!isAdmin) {
      showError("Access denied. Admin privileges required.");
      await signOut(auth);
      return;
    }

    showScreen("adminScreen");
    setDefaultEventDate();
    loadStats();
    loadImages();
  } else {
    setCurrentUser(null);
    setIsAdminUser(false);
    showScreen("loginScreen");
    document.getElementById("emailInput").value = "";
    document.getElementById("passwordInput").value = "";
    showError("");
  }
});
