/**
 * Admin Events tab — CRUD, status management, QR codes, notifications.
 */

import {
  collection,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db, auth } from "../firebase-init.js";
import { escapeHtml } from "../utils.js";
import { showToast } from "../utils.js";
import {
  selectedItems,
  eventNameCache,
  currentUser,
  updateSelectionCount,
  showConfirmModal,
} from "./state.js";

// --- Event name cache helper (used by images and users modules too) ---

export async function fetchEventNames(eventIds) {
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

// --- Status constants ---

const STATUS_BADGE = {
  draft: { label: "Draft", cssClass: "status-draft" },
  active: { label: "Active", cssClass: "status-active" },
  archived: { label: "Archived", cssClass: "status-archived" },
  deleted: { label: "Deleted", cssClass: "status-deleted" },
};

const AVAILABLE_STATUSES = ["draft", "active", "archived"];

// --- Event card rendering ---

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
  let metaHtml =
    `<span>Date: ${escapeHtml(eventDate)}</span>` +
    `<span>Code: <code>${escapeHtml(eventCode)}</code></span>`;

  if (data.application_id) {
    metaHtml += `<span class="application-link" onclick="showApplicationDetail('${data.application_id}')">📋 Application</span>`;
  }

  meta.innerHTML = metaHtml;

  info.appendChild(header);
  info.appendChild(meta);

  // Actions section
  const actions = document.createElement("div");
  actions.className = "event-card-actions";

  const qrBtn = document.createElement("button");
  qrBtn.className = "btn-secondary btn-sm";
  qrBtn.textContent = "QR Code";
  qrBtn.addEventListener("click", () =>
    showQRModal(docId, eventName, eventCode)
  );
  actions.appendChild(qrBtn);

  const rankOpenBtn = document.createElement("button");
  rankOpenBtn.className = "btn-secondary btn-sm";
  rankOpenBtn.textContent = "Ranking";
  rankOpenBtn.addEventListener("click", () =>
    window.open(getRankingUrl(docId), "_blank")
  );
  actions.appendChild(rankOpenBtn);

  const rankCopyBtn = document.createElement("button");
  rankCopyBtn.className = "btn-secondary btn-sm";
  rankCopyBtn.textContent = "URL Copy";
  rankCopyBtn.addEventListener("click", () =>
    copyToClipboard(getRankingUrl(docId))
  );
  actions.appendChild(rankCopyBtn);

  if (status === "archived") {
    const notifyBtn = document.createElement("button");
    const notificationSentAt = data.notification_sent_at;

    if (notificationSentAt) {
      notifyBtn.className = "btn-secondary btn-sm";
      notifyBtn.textContent = "📬 送信済み";
      notifyBtn.disabled = true;
      notifyBtn.title = `送信日時: ${notificationSentAt.toDate().toLocaleString("ja-JP")}\n成功: ${data.notification_sent_count || 0}件 / 失敗: ${data.notification_failed_count || 0}件`;
    } else {
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

// --- Load events ---

export async function loadEvents() {
  const container = document.getElementById("eventsList");
  container.innerHTML = '<p class="loading">Loading events...</p>';

  try {
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
        const showArchived =
          document.getElementById("showArchivedEvents").checked;
        if (
          !showArchived &&
          data.status === "archived" &&
          data.notification_sent_at
        ) {
          return false;
        }
        return true;
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

// --- Hard delete event and its images ---

export async function hardDeleteEvent(eventId) {
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

  const eventRef = doc(db, "events", eventId);
  await deleteDoc(eventRef);
}

// --- Select all events ---

export function selectAllEvents() {
  const container = document.getElementById("eventsList");
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');

  const allSelected = Array.from(checkboxes).every((cb) => cb.checked);

  checkboxes.forEach((checkbox) => {
    const item = checkbox.closest(".event-card");
    const id = item.dataset.id;

    if (allSelected) {
      checkbox.checked = false;
      selectedItems.events.delete(id);
    } else {
      checkbox.checked = true;
      selectedItems.events.add(id);
    }
  });

  updateSelectionCount("events");
}

// --- QR Code functions ---

function getJoinUrl(eventCode, eventName = "") {
  const liffId = window.LIFF_ID;

  if (liffId) {
    const baseUrl = `https://liff.line.me/${liffId}`;
    const params = new URLSearchParams({ event: eventCode });
    if (eventName) {
      params.append("name", eventName);
    }
    return `${baseUrl}?${params.toString()}`;
  } else {
    const botId = window.LINE_BOT_ID || "@581qtuij";
    return `https://line.me/R/oaMessage/${botId}/?JOIN%20${eventCode}`;
  }
}

function getRankingUrl(eventId) {
  const baseUrl = "smile-photo-contest.web.app";
  return `https://${baseUrl}/ranking.html?event_id=${eventId}`;
}

function showQRModal(eventId, eventName, eventCode) {
  const modal = document.getElementById("qrModal");
  const container = document.getElementById("qrCodeContainer");
  const deepLinkEl = document.getElementById("qrDeepLinkUrl");
  const titleEl = document.getElementById("qrModalTitle");

  const joinUrl = getJoinUrl(eventCode, eventName);

  titleEl.textContent = eventName || "QR Code";
  deepLinkEl.textContent = joinUrl;

  container.innerHTML = "";

  new QRCode(container, {
    text: joinUrl,
    width: 256,
    height: 256,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  modal.dataset.eventCode = eventCode;
  modal.classList.add("show");
}

export function downloadQRCode() {
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

export function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast("Copied to clipboard!", "success"),
    () => showToast("Failed to copy.", "error")
  );
}

// --- Event status management ---

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
  } catch (error) {
    console.error("Error updating event status:", error);
    showToast("Failed to update status: " + error.message, "error", 5000);
  }
}

// --- Post-event notification ---

async function sendPostEventNotification(eventId, eventName) {
  const confirmMsg = `「${eventName}」のゲスト全員にバイラルメッセージを送信しますか？\n\n※一度送信すると取り消しできません`;

  const confirmed = await showConfirmModal("status-change", confirmMsg);
  if (!confirmed) return;

  try {
    const notificationUrl =
      window.NOTIFICATION_FUNCTION_URL ||
      `https://asia-northeast1-${window.FIREBASE_CONFIG?.projectId || "wedding-smile-catcher"}.cloudfunctions.net/notification`;

    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const idToken = await user.getIdToken();

    const response = await fetch(notificationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
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

// --- Event creation ---

export function setDefaultEventDate() {
  const dateInput = document.getElementById("newEventDate");
  if (dateInput) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }
}

export async function createEvent() {
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

    await addDoc(collection(db, "events"), eventData);

    document.getElementById("newEventName").value = "";
    setDefaultEventDate();
    document.getElementById("eventCreateForm").style.display = "none";
    document.getElementById("eventCreateToggle").classList.remove("open");

    await loadEvents();
  } catch (error) {
    console.error("Error creating event:", error);
    showToast("Failed to create event: " + error.message, "error", 5000);
  } finally {
    submitBtn.disabled = false;
  }
}
