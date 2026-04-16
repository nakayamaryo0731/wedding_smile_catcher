/**
 * Admin Images tab — list, filter, download, delete images.
 */

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  writeBatch,
  doc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../firebase-init.js";
import { showToast } from "../utils.js";
import {
  selectedItems,
  userNameCache,
  eventNameCache,
  currentEventFilter,
  imagesTable,
  setImagesTable,
  imagesDataCache,
  setImagesDataCache,
  updateSelectionCount,
} from "./state.js";
import { fetchEventNames } from "./events.js";

function cacheUserNamesFromImages(docs) {
  for (const docSnap of docs) {
    const d = docSnap.data();
    if (d.user_id && d.user_name && !userNameCache.has(d.user_id)) {
      userNameCache.set(d.user_id, d.user_name);
    }
  }
}

export function updateEventFilter() {
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

  select.innerHTML = '<option value="">All Events</option>';

  const uniqueEvents = [...new Set(events)].filter(Boolean).sort();
  uniqueEvents.forEach((eventName) => {
    const option = document.createElement("option");
    option.value = eventName;
    option.textContent = eventName;
    select.appendChild(option);
  });
}

export async function loadImages(forceRefresh = false) {
  const container = document.getElementById("imagesTable");

  if (!forceRefresh && imagesDataCache && imagesTable) {
    return;
  }

  try {
    const q = query(
      collection(db, "images"),
      orderBy("upload_timestamp", "desc"),
      limit(1000)
    );
    const snapshot = await getDocs(q);

    cacheUserNamesFromImages(snapshot.docs);

    const imageEventIds = [
      ...new Set(snapshot.docs.map((d) => d.data().event_id).filter(Boolean)),
    ];
    await fetchEventNames(imageEventIds);

    const now = Date.now();
    const data = snapshot.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          thumbnail: d.storage_url || "",
          user_name:
            d.user_name || userNameCache.get(d.user_id) || d.user_id || "N/A",
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
          storage_url_expires_at: d.storage_url_expires_at?.seconds
            ? d.storage_url_expires_at.seconds * 1000
            : null,
        };
      })
      .filter((img) => {
        // Signed URL expiration check
        if (img.storage_url_expires_at && img.storage_url_expires_at < now) {
          return false;
        }
        // Fallback: signed URLs are max 7 days, so older images are always expired
        const SIGNED_URL_MAX_MS = 7 * 24 * 60 * 60 * 1000;
        if (img.upload_timestamp && now - img.upload_timestamp.getTime() > SIGNED_URL_MAX_MS) {
          return false;
        }
        return true;
      });

    // Pre-validate thumbnails: filter out images whose GCS object is gone
    const validatedData = await Promise.all(
      data.map(
        (img) =>
          new Promise((resolve) => {
            if (!img.thumbnail) {
              resolve(null);
              return;
            }
            const testImg = new Image();
            testImg.onload = () =>
              resolve(testImg.naturalWidth > 0 ? img : null);
            testImg.onerror = () => resolve(null);
            testImg.src = img.thumbnail;
          })
      )
    ).then((results) => results.filter(Boolean));

    setImagesDataCache(validatedData);

    const eventNames = validatedData
      .map((d) => d.event_name)
      .filter((n) => n !== "N/A");
    populateEventFilterDropdown(eventNames);

    if (imagesTable) {
      imagesTable.setData(validatedData);
      updateEventFilter();
    } else {
      const table = new Tabulator("#imagesTable", {
        data: validatedData,
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

      table.on("rowSelectionChanged", function (data, rows) {
        selectedItems.images = new Set(data.map((d) => d.id));
        updateSelectionCount("images");
      });

      setImagesTable(table);
      updateEventFilter();
    }
  } catch (error) {
    console.error("Error loading images:", error);
    container.innerHTML = '<p class="loading">Error loading images</p>';
  }
}

// --- Image URL and download helpers ---

function getImageUrl(imageData) {
  if (imageData.storage_url) return imageData.storage_url;
  console.warn(`No signed URL for image: ${imageData.id || "unknown"}`);
  return "";
}

function sanitizeFilename(name) {
  return (name || "unknown")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

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

export async function downloadSelectedImages() {
  const btn = document.getElementById("downloadSelectedImages");
  const originalText = btn.textContent;

  if (selectedItems.images.size === 0) {
    showToast("Please select images to download.", "warning");
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "Preparing...";

    const selectedImages = Array.from(selectedItems.images)
      .map((id) => imagesDataCache.find((img) => img.id === id))
      .filter((img) => img && img.thumbnail);

    if (selectedImages.length === 0) {
      showToast(
        "No valid images to download. Images may not have signed URLs.",
        "warning"
      );
      return;
    }

    if (typeof JSZip === "undefined") {
      showToast("ZIP library not loaded. Please refresh the page.", "error");
      return;
    }

    const zip = new JSZip();
    const imagesFolder = zip.folder("images");
    let downloadedCount = 0;

    const downloadImage = async (img) => {
      const response = await fetch(img.thumbnail);
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
        btn.textContent = `Downloading ${completed}/${total}...`;
      }
    );

    for (const { filename, blob } of results) {
      imagesFolder.file(filename, blob);
      downloadedCount++;
    }

    btn.textContent = "Creating ZIP...";
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
    btn.textContent = originalText;
  }
}

// Exported helpers used by statistics module
export function getUserNameFromCache(userId) {
  return userNameCache.get(userId) || userId;
}

export function enrichImagesWithUserNames(images) {
  for (const img of images) {
    if (img.user_name) continue;
    if (img.user_id) {
      img.user_name = getUserNameFromCache(img.user_id);
    }
  }
  return images;
}

export { getImageUrl };
