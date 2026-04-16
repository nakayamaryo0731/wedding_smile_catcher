/**
 * Admin Statistics tab — charts, rankings, timeline analysis.
 */

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../firebase-init.js";
import {
  cumulativeChartInstance,
  setCumulativeChartInstance,
} from "./state.js";
import { getImageUrl, enrichImagesWithUserNames } from "./images.js";

function getStatsEventId() {
  const select = document.getElementById("statsEventFilter");
  return select ? select.value : "";
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

  const peakHour = hourlyData.reduce(
    (peak, curr) => (curr.count > peak.count ? curr : peak),
    { hour: 0, count: 0 }
  );

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

    if (
      currentValue &&
      select.querySelector(`option[value="${currentValue}"]`)
    ) {
      select.value = currentValue;
    }
  } catch (error) {
    console.error("Error loading events for dropdown:", error);
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
      imgEl.onerror = () => { imgEl.style.display = "none"; };
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
  imgEl.onerror = () => { imgEl.style.display = "none"; };
  winnerEl.textContent = imageData.user_name || imageData.user_id || "Unknown";
  valueEl.textContent = `${label}: ${imageData[scoreField]}`;
}

function renderTimelineAnalysis(images) {
  const timeline = calculateTimelineStats(images);

  const chartContainer = document.getElementById("hourlyChart");
  const maxCount = Math.max(...timeline.hourlyData.map((d) => d.count), 1);

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
      Number(timeline.peakHour.hour)
    }:00-${Number(timeline.peakHour.hour) + 1}:00</strong> (${
      Number(timeline.peakHour.count)
    } uploads)`;
  }

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

  const chart = new Chart(ctx, {
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

  setCumulativeChartInstance(chart);
}

export async function loadStatistics() {
  const eventId = getStatsEventId();

  try {
    await populateStatsEventDropdown();

    let q;
    if (eventId) {
      q = query(
        collection(db, "images"),
        where("event_id", "==", eventId),
        orderBy("upload_timestamp", "asc")
      );
    } else {
      q = query(
        collection(db, "images"),
        orderBy("upload_timestamp", "asc"),
        limit(1000)
      );
    }
    const snapshot = await getDocs(q);

    const now = Date.now();
    let images = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter((img) => {
        const expiresAt = img.storage_url_expires_at?.seconds;
        if (expiresAt && expiresAt * 1000 < now) return false;
        const SIGNED_URL_MAX_MS = 7 * 24 * 60 * 60 * 1000;
        const uploadAt = img.upload_timestamp?.seconds;
        if (uploadAt && now - uploadAt * 1000 > SIGNED_URL_MAX_MS) return false;
        return true;
      });

    images = enrichImagesWithUserNames(images);

    renderBasicStats(images);
    renderRankings(images);
    renderTimelineAnalysis(images);
  } catch (error) {
    console.error("Error loading statistics:", error);
  }
}
