import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  getCountFromServer,
  query,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  doc,
  where,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const ADMIN_PASSWORD_HASH =
  "23a68358cb853df2a850e11cbf705979dd65d570e3394b7af0904c2b153fcbb5";
const GCS_BUCKET_NAME =
  window.GCS_BUCKET_NAME || "wedding-smile-images-wedding-smile-catcher";

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

// Images data cache - maintains pagination stability
let imagesDataCache = null;

// User name cache
let userNameCache = new Map();

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkAuth() {
  return sessionStorage.getItem("adminAuth") === "true";
}

function setAuth(isAuthenticated) {
  if (isAuthenticated) {
    sessionStorage.setItem("adminAuth", "true");
  } else {
    sessionStorage.removeItem("adminAuth");
  }
}

async function login(password) {
  const hash = await sha256(password);
  return hash === ADMIN_PASSWORD_HASH;
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
    const imagesSnapshot = await getDocs(collection(db, "images"));
    const usersSnapshot = await getDocs(collection(db, "users"));
    const eventsSnapshot = await getDocs(collection(db, "events"));

    document.getElementById("totalImages").textContent = imagesSnapshot.size;
    document.getElementById("totalUsers").textContent = usersSnapshot.size;
    document.getElementById("totalEvents").textContent = eventsSnapshot.size;
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
    const q = query(
      collection(db, "images"),
      orderBy("upload_timestamp", "desc"),
      limit(1000)
    );
    const snapshot = await getDocs(q);

    // Fetch all user names
    const userIds = [
      ...new Set(snapshot.docs.map((d) => d.data().user_id).filter(Boolean)),
    ];
    await fetchUserNames(userIds);

    // Transform data for Tabulator
    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        thumbnail: d.storage_path
          ? `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${d.storage_path}`
          : "",
        user_name: d.user_id
          ? userNameCache.get(d.user_id) || d.user_id
          : "N/A",
        total_score: d.total_score ?? null,
        status: d.status || "N/A",
        upload_timestamp: d.upload_timestamp?.seconds
          ? new Date(d.upload_timestamp.seconds * 1000)
          : null,
        ai_comment: d.ai_comment || d.comment || "",
      };
    });

    // Cache the data for pagination stability
    imagesDataCache = data;

    if (imagesTable) {
      imagesTable.setData(data);
    } else {
      imagesTable = new Tabulator("#imagesTable", {
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
          {
            title: "",
            field: "thumbnail",
            formatter: "image",
            formatterParams: { height: "50px", width: "50px" },
            headerSort: false,
            width: 70,
          },
          { title: "User", field: "user_name", sorter: "string", width: 120 },
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
          { title: "AI Comment", field: "ai_comment", widthGrow: 2 },
        ],
      });

      imagesTable.on("rowSelectionChanged", function (data, rows) {
        selectedItems.images = new Set(data.map((d) => d.id));
        updateSelectionCount("images");
      });
    }
  } catch (error) {
    console.error("Error loading images:", error);
    container.innerHTML = '<p class="loading">Error loading images</p>';
  }
}

async function fetchUserNames(userIds) {
  const uncachedIds = userIds.filter((id) => !userNameCache.has(id));
  if (uncachedIds.length === 0) return;

  for (const userId of uncachedIds) {
    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        userNameCache.set(userId, userSnap.data().name || userId);
      } else {
        userNameCache.set(userId, userId);
      }
    } catch (error) {
      console.error("Error fetching user:", userId, error);
      userNameCache.set(userId, userId);
    }
  }
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
    const q = query(
      collection(db, "users"),
      orderBy("best_score", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(q);

    // Transform data for Tabulator
    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        name: d.name || "N/A",
        total_uploads: d.total_uploads || 0,
        best_score: d.best_score ?? null,
        created_at: d.created_at?.seconds
          ? new Date(d.created_at.seconds * 1000)
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

async function loadEvents() {
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
      container.innerHTML = '<p class="loading">No events found</p>';
      return;
    }

    container.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const item = createDataItem(
        docSnap.id,
        {
          ID: docSnap.id,
          Name: data.event_name || "N/A",
          Status: data.status || "N/A",
          Created: data.created_at
            ? new Date(data.created_at.seconds * 1000).toLocaleString("ja-JP")
            : "N/A",
        },
        "events"
      );
      container.appendChild(item);
    });

    updateSelectionCount("events");
  } catch (error) {
    console.error("Error loading events:", error);
    container.innerHTML = '<p class="loading">Error loading events</p>';
  }
}

function createDataItem(id, fields, type) {
  const item = document.createElement("div");
  item.className = "data-item";
  item.dataset.id = id;
  item.dataset.type = type;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = selectedItems[type].has(id);
  checkbox.addEventListener("change", (e) => {
    if (e.target.checked) {
      selectedItems[type].add(id);
    } else {
      selectedItems[type].delete(id);
    }
    updateSelectionCount(type);
  });

  const content = document.createElement("div");
  content.className = "data-item-content";

  Object.entries(fields).forEach(([label, value]) => {
    const field = document.createElement("div");
    field.className = "data-field";

    const fieldLabel = document.createElement("div");
    fieldLabel.className = "data-field-label";
    fieldLabel.textContent = label;

    const fieldValue = document.createElement("div");
    fieldValue.className = "data-field-value";
    fieldValue.textContent = value;

    field.appendChild(fieldLabel);
    field.appendChild(fieldValue);
    content.appendChild(field);
  });

  item.appendChild(checkbox);
  item.appendChild(content);

  return item;
}

function updateSelectionCount(type) {
  const count = selectedItems[type].size;
  document.getElementById(
    `selected${type.charAt(0).toUpperCase() + type.slice(1)}Count`
  ).textContent = count;
  document.getElementById(
    `deleteSelected${type.charAt(0).toUpperCase() + type.slice(1)}`
  ).disabled = count === 0;
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

function showConfirmModal(type, count) {
  const modal = document.getElementById("confirmModal");
  const message = document.getElementById("confirmMessage");

  message.innerHTML = `Are you sure you want to delete <strong>${count}</strong> ${type}?<br><br>This action cannot be undone.`;

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

    alert(`Successfully deleted ${count} ${type}`);
  } catch (error) {
    console.error("Error deleting items:", error);
    alert(`Error deleting ${type}: ${error.message}`);
  }
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
  if (tabName === "statistics") loadStatistics();
}

// Statistics functions
let cumulativeChartInstance = null;

function getEventId() {
  return window.CURRENT_EVENT_ID || "test";
}

function getImageUrl(imageData) {
  const bucketName =
    window.GCS_BUCKET_NAME || "wedding-smile-images-wedding-smile-catcher";
  return (
    imageData.storage_url ||
    `https://storage.googleapis.com/${bucketName}/${imageData.storage_path}`
  );
}

async function fetchUserName(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data().name || userId;
    }
    return userId;
  } catch (error) {
    console.error("Error fetching user name:", error);
    return userId;
  }
}

async function enrichImagesWithUserNames(images) {
  const userCache = new Map();

  for (const img of images) {
    if (!img.user_id) continue;

    if (img.user_name) continue; // Already has user_name

    if (userCache.has(img.user_id)) {
      img.user_name = userCache.get(img.user_id);
    } else {
      const name = await fetchUserName(img.user_id);
      userCache.set(img.user_id, name);
      img.user_name = name;
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

async function loadStatistics() {
  const eventId = getEventId();

  try {
    const q = query(
      collection(db, "images"),
      where("event_id", "==", eventId),
      orderBy("upload_timestamp", "asc")
    );
    const snapshot = await getDocs(q);

    let images = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    // Enrich with user names from users collection
    images = await enrichImagesWithUserNames(images);

    console.log(
      `Loaded ${images.length} images for statistics (event_id: ${eventId})`
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
  if (rankings.overallTop10.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:#888;">No data</td></tr>';
  } else {
    tbody.innerHTML = rankings.overallTop10
      .map(
        (img, i) => `
            <tr>
                <td class="rank-cell">${i + 1}</td>
                <td><img src="${getImageUrl(
                  img
                )}" class="thumbnail" alt="" loading="lazy"></td>
                <td>${img.user_name || img.user_id || "Unknown"}</td>
                <td>${img.total_score.toFixed(1)}</td>
                <td>${(img.smile_score || 0).toFixed(0)}</td>
                <td>${img.ai_score || 0}</td>
            </tr>
        `
      )
      .join("");
  }

  // Most Active Users
  const activeBody = document.querySelector("#mostActiveTable tbody");
  if (rankings.mostActiveUsers.length === 0) {
    activeBody.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:#888;">No data</td></tr>';
  } else {
    activeBody.innerHTML = rankings.mostActiveUsers
      .map(
        (user, i) => `
            <tr>
                <td class="rank-cell">${i + 1}</td>
                <td>${user.name || user.userId}</td>
                <td>${user.count}</td>
                <td>${user.bestScore.toFixed(1)}</td>
            </tr>
        `
      )
      .join("");
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

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("passwordInput").value;
  const success = await login(password);

  if (success) {
    try {
      await signInAnonymously(auth);
      setAuth(true);
      showScreen("adminScreen");
      await loadStats();
      await loadImages();
    } catch (error) {
      console.error("Error signing in anonymously:", error);
      showError("Authentication error: " + error.message);
    }
  } else {
    showError("Invalid password");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  setAuth(false);
  showScreen("loginScreen");
  document.getElementById("passwordInput").value = "";
  showError("");
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
  .getElementById("refreshStats")
  .addEventListener("click", () => loadStatistics());

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

if (checkAuth()) {
  signInAnonymously(auth)
    .then(() => {
      showScreen("adminScreen");
      loadStats();
      loadImages();
    })
    .catch((error) => {
      console.error("Error signing in anonymously:", error);
      setAuth(false);
      showScreen("loginScreen");
    });
} else {
  showScreen("loginScreen");
}
