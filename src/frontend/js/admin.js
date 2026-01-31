import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  limit,
  writeBatch,
  doc,
  where,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(window.FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

let selectedItems = {
  images: new Set(),
  users: new Set(),
  events: new Set(),
};

let currentTab = "images";
let pendingDeleteAction = null;

// Tabulator instances
let imagesTable = null;
let usersTable = null;
let accountsTable = null;

// Images data cache - maintains pagination stability
let imagesDataCache = null;

// User name cache
let userNameCache = new Map();

// Event name cache
let eventNameCache = new Map();

// Current event filter
let currentEventFilter = "";

// Admin flag (operators only)
let isAdminUser = false;

// Current authenticated user (set by onAuthStateChanged)
let currentUser = null;

// Toast notification function
function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove());
  }, duration);
}

// Set default event date to today
function setDefaultEventDate() {
  const dateInput = document.getElementById("newEventDate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }
}

// Check if current user is an admin (operator)
async function checkAdminStatus() {
  if (!currentUser) {
    isAdminUser = false;
    return false;
  }
  try {
    const accountRef = doc(db, "accounts", currentUser.uid);
    const accountSnap = await getDoc(accountRef);
    if (accountSnap.exists()) {
      isAdminUser = accountSnap.data().is_admin === true;
    } else {
      isAdminUser = false;
    }
    console.log(`Admin status: ${isAdminUser}`);
    return isAdminUser;
  } catch (error) {
    console.error("Error checking admin status:", error);
    isAdminUser = false;
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

async function loadStats() {
  try {
    // Admin sees all data (no filtering)
    const imagesQuery = query(collection(db, "images"));
    const usersQuery = query(collection(db, "users"));
    const eventsQuery = query(collection(db, "events"));

    const [imagesSnapshot, usersSnapshot, eventsSnapshot] = await Promise.all([
      getCountFromServer(imagesQuery),
      getCountFromServer(usersQuery),
      getCountFromServer(eventsQuery),
    ]);

    document.getElementById("totalImages").textContent = imagesSnapshot.data().count;
    document.getElementById("totalUsers").textContent = usersSnapshot.data().count;
    document.getElementById("totalEvents").textContent = eventsSnapshot.data().count;
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

async function loadImages(forceRefresh = false) {
  const container = document.getElementById("imagesTable");

  // Use cached data if available and not forcing refresh
  // This maintains pagination stability across tab switches
  if (!forceRefresh && imagesDataCache && imagesTable) {
    return;
  }

  try {
    // Admin sees all data (no filtering)
    const q = query(
      collection(db, "images"),
      orderBy("upload_timestamp", "desc"),
      limit(1000)
    );
    const snapshot = await getDocs(q);

    // Cache user names from image documents (denormalized user_name field)
    cacheUserNamesFromImages(snapshot.docs);

    // Fetch all event names
    const imageEventIds = [
      ...new Set(snapshot.docs.map((d) => d.data().event_id).filter(Boolean)),
    ];
    await fetchEventNames(imageEventIds);

    // Transform data for Tabulator
    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        thumbnail: d.storage_url || "",  // Use signed URL only
        user_name: d.user_name || userNameCache.get(d.user_id) || d.user_id || "N/A",
        event_id: d.event_id || "",
        event_name: d.event_id
          ? eventNameCache.get(d.event_id) || d.event_id
          : "N/A",
        total_score: d.total_score ?? null,
        status: d.status || "N/A",
        upload_timestamp: d.upload_timestamp?.seconds
          ? new Date(d.upload_timestamp.seconds * 1000)
          : null,
        ai_comment: d.ai_comment || d.comment || "",
        deleted_at: d.deleted_at?.seconds
          ? new Date(d.deleted_at.seconds * 1000)
          : null,
      };
    });

    // Cache the data for pagination stability
    imagesDataCache = data;

    // Populate event filter dropdown
    const eventNames = data.map((d) => d.event_name).filter((n) => n !== "N/A");
    populateEventFilterDropdown(eventNames);

    if (imagesTable) {
      imagesTable.setData(data);
      updateEventFilter();
    } else {
      imagesTable = new Tabulator("#imagesTable", {
        data: data,
        layout: "fitData",
        pagination: true,
        paginationSize: 30,
        paginationSizeSelector: [10, 30, 50, 100],
        selectable: true,
        columns: [
          {
            formatter: "rowSelection",
            titleFormatter: "rowSelection",
            hozAlign: "center",
            headerSort: false,
            width: 40,
          },
          {
            title: "",
            field: "thumbnail",
            formatter: "image",
            formatterParams: { height: "50px", width: "50px" },
            headerSort: false,
            width: 70,
          },
          { title: "User", field: "user_name", sorter: "string", width: 120 },
          { title: "Event", field: "event_name", sorter: "string", width: 180 },
          {
            title: "Score",
            field: "total_score",
            sorter: "number",
            width: 80,
            formatter: (cell) =>
              cell.getValue() != null ? Math.round(cell.getValue()) : "N/A",
          },
          { title: "Status", field: "status", width: 100 },
          {
            title: "Deleted",
            field: "deleted_at",
            width: 100,
            hozAlign: "center",
            formatter: (cell) => {
              const val = cell.getValue();
              if (val) {
                return '<span class="status-badge status-archived">Deleted</span>';
              }
              return "";
            },
          },
          {
            title: "Uploaded",
            field: "upload_timestamp",
            width: 160,
            sorter: (a, b) => {
              if (!a) return 1;
              if (!b) return -1;
              return a.getTime() - b.getTime();
            },
            formatter: (cell) => {
              const val = cell.getValue();
              return val ? val.toLocaleString("ja-JP") : "N/A";
            },
          },
          {
            title: "AI Comment",
            field: "ai_comment",
            width: 320,
            formatter: (cell) => {
              const val = cell.getValue();
              if (!val) return "";
              const div = document.createElement("div");
              div.style.whiteSpace = "pre-wrap";
              div.style.wordBreak = "break-word";
              div.style.maxHeight = "80px";
              div.style.overflow = "auto";
              div.textContent = val;
              return div;
            },
          },
        ],
      });

      imagesTable.on("rowSelectionChanged", function (data, rows) {
        selectedItems.images = new Set(data.map((d) => d.id));
        updateSelectionCount("images");
      });

      // Apply filter if already set
      updateEventFilter();
    }
  } catch (error) {
    console.error("Error loading images:", error);
    container.innerHTML = '<p class="loading">Error loading images</p>';
  }
}

function cacheUserNamesFromImages(docs) {
  for (const docSnap of docs) {
    const d = docSnap.data();
    if (d.user_id && d.user_name && !userNameCache.has(d.user_id)) {
      userNameCache.set(d.user_id, d.user_name);
    }
  }
}

async function fetchEventNames(eventIds) {
  const uncachedIds = eventIds.filter((id) => id && !eventNameCache.has(id));
  if (uncachedIds.length === 0) return;

  for (const eventId of uncachedIds) {
    try {
      const eventRef = doc(db, "events", eventId);
      const eventSnap = await getDoc(eventRef);
      if (eventSnap.exists()) {
        eventNameCache.set(eventId, eventSnap.data().event_name || eventId);
      } else {
        eventNameCache.set(eventId, eventId);
      }
    } catch (error) {
      console.error("Error fetching event:", eventId, error);
      eventNameCache.set(eventId, eventId);
    }
  }
}

function updateEventFilter() {
  if (!imagesTable) return;

  if (currentEventFilter) {
    imagesTable.setFilter("event_name", "=", currentEventFilter);
  } else {
    imagesTable.clearFilter();
  }
}

function populateEventFilterDropdown(events) {
  const select = document.getElementById("eventFilter");
  if (!select) return;

  // Clear existing options except the first "All Events"
  select.innerHTML = '<option value="">All Events</option>';

  // Add unique events
  const uniqueEvents = [...new Set(events)].filter(Boolean).sort();
  uniqueEvents.forEach((eventName) => {
    const option = document.createElement("option");
    option.value = eventName;
    option.textContent = eventName;
    select.appendChild(option);
  });
}

// Users data cache - maintains pagination stability
let usersDataCache = null;

async function loadUsers(forceRefresh = false) {
  const container = document.getElementById("usersTable");

  // Use cached data if available and not forcing refresh
  if (!forceRefresh && usersDataCache && usersTable) {
    return;
  }

  try {
    // Admin sees all data (no filtering)
    const q = query(
      collection(db, "users"),
      orderBy("best_score", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(q);

    // Fetch event names for users
    const userEventIds = [
      ...new Set(snapshot.docs.map((d) => d.data().event_id).filter(Boolean)),
    ];
    await fetchEventNames(userEventIds);

    // Transform data for Tabulator
    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        name: d.name || "N/A",
        event_id: d.event_id || "",
        event_name: d.event_id
          ? eventNameCache.get(d.event_id) || d.event_id
          : "N/A",
        total_uploads: d.total_uploads || 0,
        best_score: d.best_score ?? null,
        created_at: d.created_at?.seconds
          ? new Date(d.created_at.seconds * 1000)
          : null,
        deleted_at: d.deleted_at?.seconds
          ? new Date(d.deleted_at.seconds * 1000)
          : null,
      };
    });

    // Cache the data for pagination stability
    usersDataCache = data;

    if (usersTable) {
      usersTable.setData(data);
    } else {
      usersTable = new Tabulator("#usersTable", {
        data: data,
        layout: "fitDataFill",
        pagination: true,
        paginationSize: 30,
        paginationSizeSelector: [10, 30, 50, 100],
        selectable: true,
        columns: [
          {
            formatter: "rowSelection",
            titleFormatter: "rowSelection",
            hozAlign: "center",
            headerSort: false,
            width: 40,
          },
          { title: "Name", field: "name", sorter: "string", widthGrow: 2 },
          { title: "Event", field: "event_name", sorter: "string", width: 180 },
          {
            title: "Uploads",
            field: "total_uploads",
            sorter: "number",
            width: 100,
          },
          {
            title: "Best Score",
            field: "best_score",
            sorter: "number",
            width: 120,
            formatter: (cell) =>
              cell.getValue() != null ? Math.round(cell.getValue()) : "N/A",
          },
          {
            title: "Created",
            field: "created_at",
            width: 160,
            sorter: (a, b) => {
              if (!a) return 1;
              if (!b) return -1;
              return a.getTime() - b.getTime();
            },
            formatter: (cell) => {
              const val = cell.getValue();
              return val ? val.toLocaleString("ja-JP") : "N/A";
            },
          },
          {
            title: "Deleted",
            field: "deleted_at",
            width: 100,
            hozAlign: "center",
            formatter: (cell) => {
              const val = cell.getValue();
              if (val) {
                return '<span class="status-badge status-archived">Deleted</span>';
              }
              return "";
            },
          },
        ],
      });

      usersTable.on("rowSelectionChanged", function (data) {
        selectedItems.users = new Set(data.map((d) => d.id));
        updateSelectionCount("users");
      });
    }
  } catch (error) {
    console.error("Error loading users:", error);
    container.innerHTML = '<p class="loading">Error loading users</p>';
  }
}

// Accounts data cache
let accountsDataCache = null;

async function loadAccounts(forceRefresh = false) {
  const container = document.getElementById("accountsTable");
  if (!container) return;

  // Use cached data if available and not forcing refresh
  if (!forceRefresh && accountsDataCache && accountsTable) {
    return;
  }

  try {
    const q = query(
      collection(db, "accounts"),
      orderBy("created_at", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(q);

    // Transform data for Tabulator
    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        email: d.email || "N/A",
        display_name: d.display_name || "N/A",
        is_admin: d.is_admin === true,
        status: d.status || "active",
        created_at: d.created_at?.seconds
          ? new Date(d.created_at.seconds * 1000)
          : null,
      };
    });

    // Cache the data
    accountsDataCache = data;

    if (accountsTable) {
      accountsTable.setData(data);
    } else {
      accountsTable = new Tabulator("#accountsTable", {
        data: data,
        layout: "fitDataFill",
        pagination: true,
        paginationSize: 30,
        paginationSizeSelector: [10, 30, 50, 100],
        columns: [
          { title: "Email", field: "email", sorter: "string", widthGrow: 2 },
          {
            title: "Role",
            field: "is_admin",
            width: 100,
            hozAlign: "center",
            formatter: (cell) => {
              const isAdmin = cell.getValue();
              return isAdmin
                ? '<span class="status-badge status-active">Admin</span>'
                : '<span class="status-badge status-draft">Customer</span>';
            },
          },
          { title: "Status", field: "status", width: 100 },
          {
            title: "Created",
            field: "created_at",
            width: 160,
            sorter: (a, b) => {
              if (!a) return 1;
              if (!b) return -1;
              return a.getTime() - b.getTime();
            },
            formatter: (cell) => {
              const val = cell.getValue();
              return val ? val.toLocaleString("ja-JP") : "N/A";
            },
          },
        ],
      });
    }
  } catch (error) {
    console.error("Error loading accounts:", error);
    container.innerHTML = '<p class="loading">Error loading accounts</p>';
  }
}

const STATUS_BADGE = {
  draft: { label: "Draft", cssClass: "status-draft" },
  active: { label: "Active", cssClass: "status-active" },
  archived: { label: "Archived", cssClass: "status-archived" },
  deleted: { label: "Deleted", cssClass: "status-deleted" },
};

// Valid status transitions
const AVAILABLE_STATUSES = ["draft", "active", "archived"];

function createEventCard(docId, data) {
  const status = data.status || "draft";
  const badge = STATUS_BADGE[status] || STATUS_BADGE.draft;
  const eventCode = data.event_code || "";
  const eventName = data.event_name || "N/A";
  const eventDate = data.event_date || "N/A";

  const card = document.createElement("div");
  card.className = "event-card";
  card.dataset.id = docId;
  card.dataset.type = "events";

  // Checkbox for bulk selection
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "event-card-checkbox";
  checkbox.checked = selectedItems.events.has(docId);
  checkbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      selectedItems.events.add(docId);
    } else {
      selectedItems.events.delete(docId);
    }
    updateSelectionCount("events");
  });

  // Info section
  const info = document.createElement("div");
  info.className = "event-card-info";

  const header = document.createElement("div");
  header.className = "event-card-header";

  // Status dropdown wrapper
  const statusWrapper = document.createElement("div");
  statusWrapper.className = "status-dropdown-wrapper";

  const badgeEl = document.createElement("span");
  badgeEl.className = `status-badge ${badge.cssClass} clickable`;
  badgeEl.textContent = badge.label;
  badgeEl.title = "Click to change status";

  const dropdown = document.createElement("div");
  dropdown.className = "status-dropdown hidden";

  AVAILABLE_STATUSES.forEach((s) => {
    if (s !== status) {
      const option = document.createElement("div");
      option.className = `status-dropdown-option ${STATUS_BADGE[s].cssClass}`;
      option.textContent = STATUS_BADGE[s].label;
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.add("hidden");
        updateEventStatus(docId, s);
      });
      dropdown.appendChild(option);
    }
  });

  badgeEl.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll(".status-dropdown").forEach((d) => {
      if (d !== dropdown) d.classList.add("hidden");
    });
    dropdown.classList.toggle("hidden");
  });

  statusWrapper.appendChild(badgeEl);
  statusWrapper.appendChild(dropdown);

  const title = document.createElement("span");
  title.className = "event-card-title";
  title.textContent = eventName;

  header.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "event-card-meta";
  meta.innerHTML =
    `<span>Date: ${eventDate}</span>` +
    `<span>Code: <code>${eventCode}</code></span>`;

  info.appendChild(header);
  info.appendChild(meta);

  // Actions section
  const actions = document.createElement("div");
  actions.className = "event-card-actions";

  // QR Code button (always visible)
  const qrBtn = document.createElement("button");
  qrBtn.className = "btn-secondary btn-sm";
  qrBtn.textContent = "QR Code";
  qrBtn.addEventListener("click", () =>
    showQRModal(docId, eventName, eventCode)
  );
  actions.appendChild(qrBtn);

  // Ranking URL button (always visible)
  const rankBtn = document.createElement("button");
  rankBtn.className = "btn-secondary btn-sm";
  rankBtn.textContent = "Ranking URL";
  rankBtn.addEventListener("click", () =>
    copyToClipboard(getRankingUrl(docId))
  );
  actions.appendChild(rankBtn);

  // Notification button (only for archived events)
  if (status === "archived") {
    const notifyBtn = document.createElement("button");
    const notificationSentAt = data.notification_sent_at;

    if (notificationSentAt) {
      // Already sent - show status
      notifyBtn.className = "btn-secondary btn-sm";
      notifyBtn.textContent = "📬 送信済み";
      notifyBtn.disabled = true;
      notifyBtn.title = `送信日時: ${notificationSentAt.toDate().toLocaleString("ja-JP")}\n成功: ${data.notification_sent_count || 0}件 / 失敗: ${data.notification_failed_count || 0}件`;
    } else {
      // Not sent yet - show send button
      notifyBtn.className = "btn-primary btn-sm";
      notifyBtn.textContent = "📣 ゲストへ通知";
      notifyBtn.addEventListener("click", () =>
        sendPostEventNotification(docId, eventName)
      );
    }
    actions.appendChild(notifyBtn);
  }

  card.appendChild(checkbox);
  card.appendChild(info);
  card.appendChild(actions);
  card.appendChild(statusWrapper);

  return card;
}

async function loadEvents() {
  const container = document.getElementById("eventsList");
  container.innerHTML = '<p class="loading">Loading events...</p>';

  try {
    // Admin sees all events (no filtering)
    const q = query(
      collection(db, "events"),
      orderBy("created_at", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      container.innerHTML =
        '<p class="loading">No events found. Create your first event above!</p>';
      return;
    }

    container.innerHTML = "";
    snapshot.docs
      .filter((docSnap) => {
        const data = docSnap.data();
        // Hide archived events that have sent notifications (completed lifecycle)
        return !(data.status === "archived" && data.notification_sent_at);
      })
      .forEach((docSnap) => {
        const data = docSnap.data();
        const card = createEventCard(docSnap.id, data);
        container.appendChild(card);
      });

    updateSelectionCount("events");
  } catch (error) {
    console.error("Error loading events:", error);
    container.innerHTML = '<p class="loading">Error loading events</p>';
  }
}

function updateSelectionCount(type) {
  const count = selectedItems[type].size;
  document.getElementById(
    `selected${type.charAt(0).toUpperCase() + type.slice(1)}Count`
  ).textContent = count;
  document.getElementById(
    `deleteSelected${type.charAt(0).toUpperCase() + type.slice(1)}`
  ).disabled = count === 0;

  // Update download button for images
  if (type === "images") {
    document.getElementById("downloadImagesCount").textContent = count;
    document.getElementById("downloadSelectedImages").disabled = count === 0;
  }
}

function selectAllItems(type) {
  const container = document.getElementById(`${type}List`);
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');

  const allSelected = Array.from(checkboxes).every((cb) => cb.checked);

  checkboxes.forEach((checkbox) => {
    const item = checkbox.closest(".data-item");
    const id = item.dataset.id;

    if (allSelected) {
      checkbox.checked = false;
      selectedItems[type].delete(id);
    } else {
      checkbox.checked = true;
      selectedItems[type].add(id);
    }
  });

  updateSelectionCount(type);
}

function showConfirmModal(type, countOrMessage) {
  const modal = document.getElementById("confirmModal");
  const message = document.getElementById("confirmMessage");
  const title = document.getElementById("confirmTitle");
  const confirmBtn = document.getElementById("confirmDelete");

  if (type === "status-change") {
    title.textContent = "Confirm Status Change";
    confirmBtn.textContent = "Confirm";
    confirmBtn.className = "btn-primary";
    message.innerHTML = countOrMessage.replace(/\n/g, "<br>");
  } else if (type === "test-data") {
    title.textContent = "Confirm Deletion";
    confirmBtn.textContent = "Delete";
    confirmBtn.className = "btn-danger";
    message.innerHTML = countOrMessage.replace(/\n/g, "<br>");
  } else {
    title.textContent = "Confirm Deletion";
    confirmBtn.textContent = "Delete";
    confirmBtn.className = "btn-danger";
    message.innerHTML = `Are you sure you want to delete <strong>${countOrMessage}</strong> ${type}?<br><br>This action cannot be undone.`;
  }

  modal.classList.add("show");

  return new Promise((resolve) => {
    pendingDeleteAction = resolve;
  });
}

function hideConfirmModal() {
  const modal = document.getElementById("confirmModal");
  modal.classList.remove("show");
  pendingDeleteAction = null;
}

async function deleteSelected(type) {
  const count = selectedItems[type].size;
  if (count === 0) return;

  const confirmed = await showConfirmModal(type, count);
  if (!confirmed) return;

  try {
    const ids = Array.from(selectedItems[type]);

    // Events are soft-deleted along with their images
    if (type === "events") {
      for (const eventId of ids) {
        await hardDeleteEvent(eventId);
      }
    } else {
      // Hard delete for other types (images, users)
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

    // Reload data
    if (type === "images") {
      imagesTable = null;
      imagesDataCache = null;
      await loadImages(true);
    }
    if (type === "users") {
      usersTable = null;
      usersDataCache = null;
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

/**
 * Soft delete an event and its associated images
 */
async function hardDeleteEvent(eventId) {
  // Delete all images for this event
  const imagesQuery = query(
    collection(db, "images"),
    where("event_id", "==", eventId)
  );
  const imagesSnap = await getDocs(imagesQuery);

  if (imagesSnap.docs.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < imagesSnap.docs.length; i += batchSize) {
      const batch = writeBatch(db);
      const chunk = imagesSnap.docs.slice(i, i + batchSize);
      chunk.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }
  }

  // Delete the event document
  const eventRef = doc(db, "events", eventId);
  await deleteDoc(eventRef);

  console.log(
    `Deleted event ${eventId} and ${imagesSnap.docs.length} images`
  );
}

function switchTab(tabName) {
  currentTab = tabName;

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
  if (tabName === "accounts") loadAccounts();
  if (tabName === "statistics") loadStatistics();
}

// Statistics functions
let cumulativeChartInstance = null;

function getStatsEventId() {
  const select = document.getElementById("statsEventFilter");
  return select ? select.value : "";
}

/**
 * Get image URL from image data, using signed URL only
 * Falls back to empty string if no signed URL is available
 */
function getImageUrl(imageData) {
  if (imageData.storage_url) {
    return imageData.storage_url;
  }
  console.warn(`No signed URL for image: ${imageData.id || "unknown"}`);
  return "";
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(name) {
  return (name || "unknown")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

/**
 * Process items in batches to avoid overwhelming the server
 */
const DOWNLOAD_BATCH_SIZE = 5;

async function processBatches(items, processor, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i += DOWNLOAD_BATCH_SIZE) {
    const batch = items.slice(i, i + DOWNLOAD_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((item) =>
        processor(item).catch((err) => {
          console.warn("Batch item failed:", err);
          return null;
        })
      )
    );
    results.push(...batchResults.filter((r) => r !== null));
    if (onProgress) {
      onProgress(Math.min(i + DOWNLOAD_BATCH_SIZE, items.length), items.length);
    }
  }
  return results;
}

/**
 * Download selected images as a ZIP file
 */
async function downloadSelectedImages() {
  const btn = document.getElementById("downloadSelectedImages");
  const originalText = btn.innerHTML;

  if (selectedItems.images.size === 0) {
    showToast("Please select images to download.", "warning");
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = "Preparing...";

    // Get selected images from cache (imagesDataCache is an array)
    // Note: storage_url is stored as 'thumbnail' in the cache
    const selectedImages = Array.from(selectedItems.images)
      .map((id) => imagesDataCache.find((img) => img.id === id))
      .filter((img) => img && img.thumbnail);

    if (selectedImages.length === 0) {
      showToast("No valid images to download. Images may not have signed URLs.", "warning");
      return;
    }

    // Check if JSZip is available
    if (typeof JSZip === "undefined") {
      showToast("ZIP library not loaded. Please refresh the page.", "error");
      return;
    }

    const zip = new JSZip();
    const imagesFolder = zip.folder("images");
    let downloadedCount = 0;

    // Download images in batches
    const downloadImage = async (img) => {
      const response = await fetch(img.thumbnail); // thumbnail contains signed URL
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      const score = (img.total_score || 0).toFixed(2);
      const userName = sanitizeFilename(img.user_name);
      const filename = `${userName}_${score}_${img.id}.jpg`;

      return { filename, blob };
    };

    const results = await processBatches(
      selectedImages,
      downloadImage,
      (completed, total) => {
        btn.innerHTML = `Downloading ${completed}/${total}...`;
      }
    );

    // Add to ZIP
    for (const { filename, blob } of results) {
      imagesFolder.file(filename, blob);
      downloadedCount++;
    }

    // Generate ZIP and download
    btn.innerHTML = "Creating ZIP...";
    const content = await zip.generateAsync({ type: "blob" });

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .slice(0, 15);
    const zipFilename = `images_${timestamp}.zip`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = zipFilename;
    link.click();
    URL.revokeObjectURL(link.href);

    showToast(`Downloaded ${downloadedCount} images successfully.`, "success");
  } catch (error) {
    console.error("Download failed:", error);
    showToast("Download failed: " + error.message, "error", 5000);
  } finally {
    btn.disabled = selectedItems.images.size === 0;
    btn.innerHTML = originalText;
  }
}

function getUserNameFromCache(userId) {
  return userNameCache.get(userId) || userId;
}

function enrichImagesWithUserNames(images) {
  for (const img of images) {
    if (img.user_name) continue; // Already has denormalized user_name
    if (img.user_id) {
      img.user_name = getUserNameFromCache(img.user_id);
    }
  }
  return images;
}

function calculateBasicStats(images) {
  const scoredImages = images.filter(
    (img) => typeof img.total_score === "number" && !isNaN(img.total_score)
  );

  const scores = scoredImages
    .map((img) => img.total_score)
    .sort((a, b) => a - b);
  const uniqueUsers = new Set(scoredImages.map((img) => img.user_id));

  const getMedian = (arr) => {
    if (arr.length === 0) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };

  return {
    totalImages: images.length,
    scoredImages: scoredImages.length,
    uniqueUsers: uniqueUsers.size,
    avgScore: scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0,
    maxScore: scores.length ? Math.max(...scores) : 0,
    medianScore: getMedian(scores),
    avgUploadsPerUser: uniqueUsers.size
      ? scoredImages.length / uniqueUsers.size
      : 0,
  };
}

function calculateRankings(images) {
  const scoredImages = images.filter(
    (img) => typeof img.total_score === "number" && !isNaN(img.total_score)
  );

  // Overall Top 10 (unique users)
  const userBestScores = new Map();
  scoredImages.forEach((img) => {
    const existing = userBestScores.get(img.user_id);
    if (!existing || img.total_score > existing.total_score) {
      userBestScores.set(img.user_id, img);
    }
  });
  const overallTop10 = Array.from(userBestScores.values())
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10);

  // Most Active Users (Top 5)
  const userUploadCounts = new Map();
  scoredImages.forEach((img) => {
    const data = userUploadCounts.get(img.user_id) || {
      count: 0,
      name: img.user_name || img.user_id,
      bestScore: 0,
    };
    data.count++;
    data.bestScore = Math.max(data.bestScore, img.total_score);
    userUploadCounts.set(img.user_id, data);
  });
  const mostActiveUsers = Array.from(userUploadCounts.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Special Awards
  const bestSmile = scoredImages.reduce(
    (best, img) =>
      (img.smile_score || 0) > (best?.smile_score || 0) ? img : best,
    null
  );
  const bestAI = scoredImages.reduce(
    (best, img) => ((img.ai_score || 0) > (best?.ai_score || 0) ? img : best),
    null
  );

  return {
    overallTop10,
    mostActiveUsers,
    specialAwards: { bestSmile, bestAI },
  };
}

function calculateTimelineStats(images) {
  const scoredImages = images.filter(
    (img) => img.upload_timestamp && typeof img.total_score === "number"
  );

  // Hourly distribution
  const hourlyCount = new Map();
  scoredImages.forEach((img) => {
    const date = new Date(img.upload_timestamp.seconds * 1000);
    const hour = date.getHours();
    hourlyCount.set(hour, (hourlyCount.get(hour) || 0) + 1);
  });

  const hourlyData = [];
  for (let h = 0; h <= 23; h++) {
    hourlyData.push({ hour: h, count: hourlyCount.get(h) || 0 });
  }

  // Peak hour
  const peakHour = hourlyData.reduce(
    (peak, curr) => (curr.count > peak.count ? curr : peak),
    { hour: 0, count: 0 }
  );

  // Cumulative timeline
  const sortedImages = [...scoredImages].sort(
    (a, b) => a.upload_timestamp.seconds - b.upload_timestamp.seconds
  );

  const cumulativeData = sortedImages.map((img, index) => ({
    time: new Date(img.upload_timestamp.seconds * 1000),
    cumulative: index + 1,
  }));

  return { hourlyData, peakHour, cumulativeData };
}

async function populateStatsEventDropdown() {
  const select = document.getElementById("statsEventFilter");
  if (!select) return;

  const currentValue = select.value;

  try {
    // Admin sees all events (no filtering)
    const eventsQuery = query(collection(db, "events"));
    const eventsSnapshot = await getDocs(eventsQuery);
    select.innerHTML = '<option value="">All Events</option>';

    eventsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const option = document.createElement("option");
      option.value = docSnap.id;
      option.textContent = data.event_name || docSnap.id;
      select.appendChild(option);
    });

    // Restore selection if it still exists
    if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
      select.value = currentValue;
    }
  } catch (error) {
    console.error("Error loading events for dropdown:", error);
  }
}

async function loadStatistics() {
  const eventId = getStatsEventId();

  try {
    // Populate events dropdown
    await populateStatsEventDropdown();

    let q;
    if (eventId) {
      // Filter by specific event
      q = query(
        collection(db, "images"),
        where("event_id", "==", eventId),
        orderBy("upload_timestamp", "asc")
      );
    } else {
      // All events
      q = query(
        collection(db, "images"),
        orderBy("upload_timestamp", "asc"),
        limit(1000)
      );
    }
    const snapshot = await getDocs(q);

    let images = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    // Enrich with user names (from denormalized user_name field or cache)
    images = enrichImagesWithUserNames(images);

    const filterLabel = eventId || "all events";
    console.log(
      `Loaded ${images.length} images for statistics (event_id: ${filterLabel})`
    );

    renderBasicStats(images);
    renderRankings(images);
    renderTimelineAnalysis(images);
  } catch (error) {
    console.error("Error loading statistics:", error);
  }
}

function renderBasicStats(images) {
  const stats = calculateBasicStats(images);

  document.getElementById("statTotalImages").textContent = stats.totalImages;
  document.getElementById("statScoredImages").textContent = stats.scoredImages;
  document.getElementById("statUniqueUsers").textContent = stats.uniqueUsers;
  document.getElementById("statAvgScore").textContent =
    stats.avgScore.toFixed(1);
  document.getElementById("statMaxScore").textContent =
    stats.maxScore.toFixed(1);
  document.getElementById("statMedianScore").textContent =
    stats.medianScore.toFixed(1);
  document.getElementById("statAvgPosts").textContent =
    stats.avgUploadsPerUser.toFixed(1);
}

function renderRankings(images) {
  const rankings = calculateRankings(images);

  // Overall Top 10
  const tbody = document.querySelector("#overallTop10Table tbody");
  tbody.innerHTML = "";

  if (rankings.overallTop10.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 6;
    emptyCell.style.textAlign = "center";
    emptyCell.style.color = "#888";
    emptyCell.textContent = "No data";
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  } else {
    rankings.overallTop10.forEach((img, i) => {
      const row = document.createElement("tr");

      const rankCell = document.createElement("td");
      rankCell.className = "rank-cell";
      rankCell.textContent = i + 1;

      const imgCell = document.createElement("td");
      const imgEl = document.createElement("img");
      imgEl.src = getImageUrl(img);
      imgEl.className = "thumbnail";
      imgEl.alt = "";
      imgEl.loading = "lazy";
      imgCell.appendChild(imgEl);

      const nameCell = document.createElement("td");
      nameCell.textContent = img.user_name || img.user_id || "Unknown";

      const scoreCell = document.createElement("td");
      scoreCell.textContent = img.total_score.toFixed(1);

      const smileCell = document.createElement("td");
      smileCell.textContent = (img.smile_score || 0).toFixed(0);

      const aiCell = document.createElement("td");
      aiCell.textContent = img.ai_score || 0;

      row.append(rankCell, imgCell, nameCell, scoreCell, smileCell, aiCell);
      tbody.appendChild(row);
    });
  }

  // Most Active Users
  const activeBody = document.querySelector("#mostActiveTable tbody");
  activeBody.innerHTML = "";

  if (rankings.mostActiveUsers.length === 0) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 4;
    emptyCell.style.textAlign = "center";
    emptyCell.style.color = "#888";
    emptyCell.textContent = "No data";
    emptyRow.appendChild(emptyCell);
    activeBody.appendChild(emptyRow);
  } else {
    rankings.mostActiveUsers.forEach((user, i) => {
      const row = document.createElement("tr");

      const rankCell = document.createElement("td");
      rankCell.className = "rank-cell";
      rankCell.textContent = i + 1;

      const nameCell = document.createElement("td");
      nameCell.textContent = user.name || user.userId;

      const countCell = document.createElement("td");
      countCell.textContent = user.count;

      const scoreCell = document.createElement("td");
      scoreCell.textContent = user.bestScore.toFixed(1);

      row.append(rankCell, nameCell, countCell, scoreCell);
      activeBody.appendChild(row);
    });
  }

  // Special Awards
  renderAward(
    "awardBestSmile",
    rankings.specialAwards.bestSmile,
    "smile_score",
    "Smile"
  );
  renderAward("awardBestAI", rankings.specialAwards.bestAI, "ai_score", "AI");
}

function renderAward(elementId, imageData, scoreField, label) {
  const card = document.getElementById(elementId);
  const imgEl = card.querySelector(".award-image");
  const winnerEl = card.querySelector(".award-winner");
  const valueEl = card.querySelector(".award-value");

  if (!imageData) {
    imgEl.src = "";
    winnerEl.textContent = "-";
    valueEl.textContent = "-";
    return;
  }

  imgEl.src = getImageUrl(imageData);
  winnerEl.textContent = imageData.user_name || imageData.user_id || "Unknown";
  valueEl.textContent = `${label}: ${imageData[scoreField]}`;
}

function renderTimelineAnalysis(images) {
  const timeline = calculateTimelineStats(images);

  // Hourly Bar Chart
  const chartContainer = document.getElementById("hourlyChart");
  const maxCount = Math.max(...timeline.hourlyData.map((d) => d.count), 1);

  // Filter to hours with activity (or adjacent)
  const activeHours = timeline.hourlyData.filter((d) => d.count > 0);
  if (activeHours.length === 0) {
    chartContainer.innerHTML =
      '<p style="text-align:center;color:#888;padding:2rem;">No data</p>';
    document.getElementById("peakTimeInfo").innerHTML = "";
  } else {
    const minHour = Math.max(
      0,
      Math.min(...activeHours.map((d) => d.hour)) - 1
    );
    const maxHour = Math.min(
      23,
      Math.max(...activeHours.map((d) => d.hour)) + 1
    );

    chartContainer.innerHTML = timeline.hourlyData
      .filter((d) => d.hour >= minHour && d.hour <= maxHour)
      .map(
        (d) => `
                <div class="bar"
                     style="--height: ${(d.count / maxCount) * 100}%;"
                     data-value="${d.count}">
                    <span class="bar-label">${d.hour}時</span>
                </div>
            `
      )
      .join("");

    document.getElementById("peakTimeInfo").innerHTML = `Peak Time: <strong>${
      timeline.peakHour.hour
    }:00-${timeline.peakHour.hour + 1}:00</strong> (${
      timeline.peakHour.count
    } uploads)`;
  }

  // Cumulative Chart
  renderCumulativeChart(timeline.cumulativeData);
}

function renderCumulativeChart(data) {
  const canvas = document.getElementById("cumulativeChart");
  const ctx = canvas.getContext("2d");

  if (cumulativeChartInstance) {
    cumulativeChartInstance.destroy();
  }

  if (data.length === 0) {
    canvas.style.display = "none";
    return;
  }
  canvas.style.display = "block";

  cumulativeChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((d) =>
        d.time.toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        })
      ),
      datasets: [
        {
          label: "Cumulative Uploads",
          data: data.map((d) => d.cumulative),
          borderColor: "#1a472a",
          backgroundColor: "rgba(26, 71, 42, 0.1)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          display: true,
          ticks: { maxTicksLimit: 8 },
        },
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}

// QR Code generation and modal functions
function getJoinUrl(eventCode, eventName = "") {
  const liffId = window.LIFF_ID;

  if (liffId) {
    // Use LIFF for seamless auto-join experience
    const baseUrl = `https://liff.line.me/${liffId}`;
    const params = new URLSearchParams({ event: eventCode });
    if (eventName) {
      params.append("name", eventName);
    }
    return `${baseUrl}?${params.toString()}`;
  } else {
    // Fallback to traditional deep link
    const botId = window.LINE_BOT_ID || "@581qtuij";
    return `https://line.me/R/oaMessage/${botId}/?JOIN%20${eventCode}`;
  }
}

function getRankingUrl(eventId) {
  // Use the new Firebase Hosting domain
  const baseUrl = "smile-photo-contest.web.app";
  return `https://${baseUrl}?event_id=${eventId}`;
}

function showQRModal(eventId, eventName, eventCode) {
  const modal = document.getElementById("qrModal");
  const container = document.getElementById("qrCodeContainer");
  const deepLinkEl = document.getElementById("qrDeepLinkUrl");
  const titleEl = document.getElementById("qrModalTitle");

  const joinUrl = getJoinUrl(eventCode, eventName);

  titleEl.textContent = eventName || "QR Code";
  deepLinkEl.textContent = joinUrl;

  // Clear previous QR code
  container.innerHTML = "";

  // Generate new QR code
  new QRCode(container, {
    text: joinUrl,
    width: 256,
    height: 256,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  // Store eventCode for download
  modal.dataset.eventCode = eventCode;

  modal.classList.add("show");
}

function downloadQRCode() {
  const container = document.getElementById("qrCodeContainer");
  const canvas = container.querySelector("canvas");
  if (!canvas) return;

  const modal = document.getElementById("qrModal");
  const eventCode = modal.dataset.eventCode || "event";

  const link = document.createElement("a");
  link.download = `qrcode_${eventCode}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast("Copied to clipboard!", "success"),
    () => showToast("Failed to copy.", "error")
  );
}

// Event status management
async function updateEventStatus(eventId, newStatus) {
  const confirmMsg = {
    draft: "Change status to Draft?",
    active: "Activate this event?\nGuests will be able to join via QR code.",
    archived: "Archive this event?\nGuests will no longer be able to join.",
  };

  const confirmed = await showConfirmModal(
    "status-change",
    confirmMsg[newStatus]
  );
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "events", eventId), { status: newStatus });
    await loadEvents();
    await loadStats();
  } catch (error) {
    console.error("Error updating event status:", error);
    showToast("Failed to update status: " + error.message, "error", 5000);
  }
}

// Post-event notification
async function sendPostEventNotification(eventId, eventName) {
  const confirmMsg = `「${eventName}」のゲスト全員にバイラルメッセージを送信しますか？\n\n※一度送信すると取り消しできません`;

  const confirmed = await showConfirmModal("status-change", confirmMsg);
  if (!confirmed) return;

  try {
    const notificationUrl =
      window.NOTIFICATION_FUNCTION_URL ||
      `https://asia-northeast1-${window.FIREBASE_CONFIG?.projectId || "wedding-smile-catcher"}.cloudfunctions.net/notification`;

    const response = await fetch(notificationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_id: eventId }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unknown error");
    }

    showToast(
      `通知送信完了! 成功: ${result.sent_count}件 / 失敗: ${result.failed_count}件`,
      "success",
      5000
    );
    await loadEvents();
  } catch (error) {
    console.error("Error sending notification:", error);
    showToast("通知送信に失敗しました: " + error.message, "error", 5000);
  }
}

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

// Terms of Service link - open in new tab
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
    // onAuthStateChanged will handle the rest
  } catch (error) {
    console.error("Login failed:", error);
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
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
    const displayName = document.getElementById("regDisplayNameInput").value.trim();
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

      console.log("Account created:", user.uid);
      // onAuthStateChanged will handle navigation
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
    const eventName = document.getElementById("newEventName").value.trim();
    const eventDate = document.getElementById("newEventDate").value;
    const submitBtn = document.getElementById("eventCreateBtn");

    if (!eventName || eventName.length > 100) {
      showToast("Event name must be 1-100 characters.", "warning");
      return;
    }

    if (!eventDate) {
      showToast("Event date is required.", "warning");
      return;
    }

    if (!currentUser) {
      showToast("Please log in first.", "warning");
      return;
    }

    submitBtn.disabled = true;

    try {
      const eventCode = crypto.randomUUID();
      const eventData = {
        event_name: eventName,
        event_date: eventDate,
        event_code: eventCode,
        account_id: currentUser.uid,
        status: "draft",
        created_at: serverTimestamp(),
        theme: "classic-ivory",
        settings: {
          theme: "笑顔（Smile For You）",
          max_uploads_per_user: 10,
          similarity_threshold: 8,
          similarity_penalty: 0.33,
        },
      };

      const docRef = await addDoc(collection(db, "events"), eventData);
      console.log("Event created:", docRef.id);

      // Clear form and collapse
      document.getElementById("newEventName").value = "";
      setDefaultEventDate();
      document.getElementById("eventCreateForm").style.display = "none";
      document.getElementById("eventCreateToggle").classList.remove("open");

      // Reload events list
      await loadEvents();
      await loadStats();
    } catch (error) {
      console.error("Error creating event:", error);
      showToast("Failed to create event: " + error.message, "error", 5000);
    } finally {
      submitBtn.disabled = false;
    }
  });

// Refresh events button
document
  .getElementById("refreshEvents")
  .addEventListener("click", () => loadEvents());

// Refresh accounts button
document
  .getElementById("refreshAccounts")
  .addEventListener("click", () => loadAccounts(true));

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    // onAuthStateChanged will handle the rest
  } catch (error) {
    console.error("Logout failed:", error);
  }
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

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
  .addEventListener("click", () => selectAllItems("events"));

document
  .getElementById("deleteSelectedImages")
  .addEventListener("click", () => deleteSelected("images"));
document
  .getElementById("deleteSelectedUsers")
  .addEventListener("click", () => deleteSelected("users"));
document
  .getElementById("deleteSelectedEvents")
  .addEventListener("click", () => deleteSelected("events"));

document
  .getElementById("downloadSelectedImages")
  .addEventListener("click", () => downloadSelectedImages());

document
  .getElementById("refreshStats")
  .addEventListener("click", () => loadStatistics());

document.getElementById("statsEventFilter").addEventListener("change", () => {
  loadStatistics();
});

document.getElementById("eventFilter").addEventListener("change", (e) => {
  currentEventFilter = e.target.value;
  updateEventFilter();
});

// QR Modal event listeners
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

document.getElementById("confirmDelete").addEventListener("click", () => {
  if (pendingDeleteAction) {
    pendingDeleteAction(true);
    hideConfirmModal();
  }
});

document.getElementById("cancelDelete").addEventListener("click", () => {
  if (pendingDeleteAction) {
    pendingDeleteAction(false);
    hideConfirmModal();
  }
});

// Close status dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".status-dropdown-wrapper")) {
    document.querySelectorAll(".status-dropdown").forEach((d) => {
      d.classList.add("hidden");
    });
  }
});

// Firebase Auth state listener - handles login/logout state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    console.log("Authenticated as:", user.email);

    // Check if user is admin (operator)
    const isAdmin = await checkAdminStatus();
    if (!isAdmin) {
      // Non-admin users cannot access admin panel
      showError("Access denied. Admin privileges required.");
      await signOut(auth);
      return;
    }

    showScreen("adminScreen");
    setDefaultEventDate();
    loadStats();
    loadImages();
  } else {
    currentUser = null;
    isAdminUser = false;
    showScreen("loginScreen");
    document.getElementById("emailInput").value = "";
    document.getElementById("passwordInput").value = "";
    showError("");
  }
});
