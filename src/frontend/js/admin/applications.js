/**
 * Admin Applications tab — list, detail modal, create event from application.
 */

import {
  collection,
  getDocs,
  getDoc,
  query,
  orderBy,
  limit,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { showToast } from "../utils.js";
import {
  currentUser,
  applicationsTable,
  setApplicationsTable,
  applicationsDataCache,
  setApplicationsDataCache,
  currentApplicationId,
  setCurrentApplicationId,
} from "./state.js";
import { loadEvents } from "./events.js";

const APPLICATION_STATUS_BADGE = {
  pending: { label: "Pending", cssClass: "status-draft" },
  event_created: { label: "Created", cssClass: "status-active" },
  rejected: { label: "Rejected", cssClass: "status-archived" },
};

export async function loadApplications(forceRefresh = false) {
  const container = document.getElementById("applicationsTable");
  if (!container) return;

  if (!forceRefresh && applicationsDataCache && applicationsTable) {
    return;
  }

  try {
    const q = query(
      collection(db, "applications"),
      orderBy("created_at", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(q);

    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        groom_name: d.groom_name || "",
        bride_name: d.bride_name || "",
        couple_name: `${d.groom_name || ""} & ${d.bride_name || ""}`,
        email: d.email || "",
        event_date: d.event_date || "",
        start_time: d.start_time || "",
        end_time: d.end_time || "",
        guest_count: d.guest_count || "",
        venue_name: d.venue_name || "",
        referral_source: d.referral_source || "",
        questions: d.questions || "",
        status: d.status || "pending",
        event_id: d.event_id || null,
        created_at: d.created_at?.seconds
          ? new Date(d.created_at.seconds * 1000)
          : null,
      };
    });

    setApplicationsDataCache(data);

    const showProcessed = document.getElementById(
      "showProcessedApplications"
    ).checked;
    const filteredData = showProcessed
      ? data
      : data.filter((app) => app.status === "pending");

    if (applicationsTable) {
      applicationsTable.setData(filteredData);
    } else {
      const table = new Tabulator("#applicationsTable", {
        data: filteredData,
        layout: "fitDataFill",
        pagination: true,
        paginationSize: 30,
        paginationSizeSelector: [10, 30, 50, 100],
        columns: [
          {
            title: "Status",
            field: "status",
            width: 100,
            hozAlign: "center",
            formatter: function (cell) {
              const status = cell.getValue();
              const badge =
                APPLICATION_STATUS_BADGE[status] ||
                APPLICATION_STATUS_BADGE.pending;
              return `<span class="status-badge ${badge.cssClass}">${badge.label}</span>`;
            },
          },
          {
            title: "Couple",
            field: "couple_name",
            sorter: "string",
            widthGrow: 2,
          },
          { title: "Event Date", field: "event_date", sorter: "string" },
          { title: "Guests", field: "guest_count", sorter: "string" },
          {
            title: "Applied",
            field: "created_at",
            sorter: "date",
            formatter: "datetime",
            formatterParams: {
              outputFormat: "yyyy/MM/dd HH:mm",
            },
          },
          {
            title: "Actions",
            field: "id",
            width: 150,
            hozAlign: "center",
            formatter: function (cell) {
              const data = cell.getRow().getData();
              let buttons = `<button class="btn-sm btn-secondary" onclick="showApplicationDetail('${data.id}')">Detail</button>`;
              if (data.status === "pending") {
                buttons += ` <button class="btn-sm btn-primary" onclick="createEventFromApplicationDirect('${data.id}')">✓</button>`;
              }
              return buttons;
            },
          },
        ],
      });

      setApplicationsTable(table);
    }
  } catch (error) {
    console.error("Error loading applications:", error);
    container.innerHTML = '<p class="loading">Error loading applications</p>';
  }
}

export async function showApplicationDetail(applicationId) {
  let app = applicationsDataCache?.find((a) => a.id === applicationId);

  if (!app) {
    try {
      const docSnap = await getDoc(doc(db, "applications", applicationId));
      if (!docSnap.exists()) {
        showToast("Application not found", "error");
        return;
      }
      const data = docSnap.data();
      app = {
        id: applicationId,
        ...data,
        created_at: data.created_at?.toDate(),
      };
    } catch (error) {
      console.error("Error fetching application:", error);
      showToast("Failed to load application", "error");
      return;
    }
  }

  setCurrentApplicationId(applicationId);

  const detail = document.getElementById("applicationDetail");
  detail.innerHTML = `
    <div class="application-detail-grid">
      <div class="detail-row">
        <label>Status:</label>
        <span class="status-badge ${APPLICATION_STATUS_BADGE[app.status]?.cssClass || "status-draft"}">${APPLICATION_STATUS_BADGE[app.status]?.label || app.status}</span>
      </div>
      <div class="detail-row">
        <label>Couple:</label>
        <span>${app.groom_name} & ${app.bride_name}</span>
      </div>
      <div class="detail-row">
        <label>Email:</label>
        <span><a href="mailto:${app.email}">${app.email}</a></span>
      </div>
      <div class="detail-row">
        <label>Event Date:</label>
        <span>${app.event_date}</span>
      </div>
      <div class="detail-row">
        <label>Time:</label>
        <span>${app.start_time} 〜 ${app.end_time}</span>
      </div>
      <div class="detail-row">
        <label>Guests:</label>
        <span>${app.guest_count}</span>
      </div>
      <div class="detail-row">
        <label>Venue:</label>
        <span>${app.venue_name || "-"}</span>
      </div>
      <div class="detail-row">
        <label>Referral:</label>
        <span>${app.referral_source || "-"}</span>
      </div>
      ${
        app.questions
          ? `<div class="detail-row detail-row-full">
        <label>Questions/Requests:</label>
        <span class="detail-text">${app.questions}</span>
      </div>`
          : ""
      }
      <div class="detail-row">
        <label>Applied:</label>
        <span>${app.created_at ? app.created_at.toLocaleString("ja-JP") : "-"}</span>
      </div>
      ${
        app.event_id
          ? `<div class="detail-row">
        <label>Event ID:</label>
        <span>${app.event_id}</span>
      </div>`
          : ""
      }
    </div>
  `;

  const createBtn = document.getElementById("createEventFromApplication");
  const rejectBtn = document.getElementById("rejectApplication");

  if (app.status === "pending") {
    createBtn.style.display = "inline-block";
    rejectBtn.style.display = "inline-block";
  } else {
    createBtn.style.display = "none";
    rejectBtn.style.display = "none";
  }

  document.getElementById("applicationModal").classList.add("show");
}

// Expose to global scope for onclick handlers in Tabulator cells
window.showApplicationDetail = showApplicationDetail;

export async function createEventFromApplication(applicationId) {
  const app = applicationsDataCache.find((a) => a.id === applicationId);
  if (!app) return;

  try {
    const eventCode = crypto.randomUUID();
    const eventData = {
      event_name: `${app.groom_name} & ${app.bride_name} Wedding`,
      event_date: app.event_date,
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
      application_id: applicationId,
      start_time: app.start_time,
      end_time: app.end_time,
      guest_count: app.guest_count,
      venue_name: app.venue_name,
    };

    const eventRef = await addDoc(collection(db, "events"), eventData);

    await updateDoc(doc(db, "applications", applicationId), {
      status: "event_created",
      event_id: eventRef.id,
    });

    showToast("Event created successfully", "success");

    setApplicationsDataCache(null);
    await loadApplications(true);
    await loadEvents();

    document.getElementById("applicationModal").classList.remove("show");
  } catch (error) {
    console.error("Error creating event from application:", error);
    showToast("Failed to create event: " + error.message, "error", 5000);
  }
}

export async function createEventFromApplicationDirect(applicationId) {
  if (confirm("Create event from this application?")) {
    await createEventFromApplication(applicationId);
  }
}

window.createEventFromApplicationDirect = createEventFromApplicationDirect;

/**
 * Re-filter the applications table using cached data (no re-fetch).
 */
export function filterApplications() {
  if (applicationsDataCache && applicationsTable) {
    const showProcessed = document.getElementById(
      "showProcessedApplications"
    ).checked;
    const filteredData = showProcessed
      ? applicationsDataCache
      : applicationsDataCache.filter((app) => app.status === "pending");
    applicationsTable.setData(filteredData);
  }
}

export async function rejectApplication(applicationId) {
  if (!confirm("Reject this application?")) return;

  try {
    await updateDoc(doc(db, "applications", applicationId), {
      status: "rejected",
    });

    showToast("Application rejected", "success");

    setApplicationsDataCache(null);
    await loadApplications(true);

    document.getElementById("applicationModal").classList.remove("show");
  } catch (error) {
    console.error("Error rejecting application:", error);
    showToast(
      "Failed to reject application: " + error.message,
      "error",
      5000
    );
  }
}
