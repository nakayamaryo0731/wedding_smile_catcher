import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// State
let currentTop3 = [];
let isFinalMode = false;

/**
 * Get current event ID from URL parameters or config
 * Supports: ?event_id=wedding_20250315_tanaka
 */
function getCurrentEventId() {
  const params = new URLSearchParams(window.location.search);
  const eventIdFromUrl = params.get("event_id");

  if (eventIdFromUrl) {
    console.log(`Using event_id from URL: ${eventIdFromUrl}`);
    return eventIdFromUrl;
  }

  const defaultEventId = window.CURRENT_EVENT_ID || "test";
  console.log(`Using default event_id: ${defaultEventId}`);
  return defaultEventId;
}

// DOM Elements
const loadingEl = document.getElementById("loading");
const rankCards = {
  1: {
    card: document.getElementById("rank-1"),
    image: document.getElementById("rank-1-image"),
    name: document.getElementById("rank-1-name"),
    score: document.getElementById("rank-1-score"),
    comment: document.getElementById("rank-1-comment"),
  },
  2: {
    card: document.getElementById("rank-2"),
    image: document.getElementById("rank-2-image"),
    name: document.getElementById("rank-2-name"),
    score: document.getElementById("rank-2-score"),
  },
  3: {
    card: document.getElementById("rank-3"),
    image: document.getElementById("rank-3-image"),
    name: document.getElementById("rank-3-name"),
    score: document.getElementById("rank-3-score"),
  },
};

/**
 * Fetch user name from users collection
 */
async function fetchUserName(userId) {
  try {
    const userRef = doc(window.db, "users", userId);
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

/**
 * Get top N images from list
 * No filtering by user - same user can appear multiple times
 */
function getTopImages(images, count = 3) {
  return images.slice(0, count);
}

/**
 * Render ranking list items (4-10位)
 * @param {array} images - Array of image data (should be items 4-10)
 * @param {number} startRank - Starting rank number (default 4)
 */
function renderRankingList(images, startRank = 4) {
  const listContainer = document.getElementById("ranking-list-items");
  if (!listContainer) return;

  listContainer.innerHTML = "";

  const bucketName =
    window.GCS_BUCKET_NAME || "wedding-smile-images-wedding-smile-catcher";

  images.forEach((imageData, index) => {
    const rank = startRank + index;
    const imageUrl =
      imageData.storage_url ||
      `https://storage.googleapis.com/${bucketName}/${imageData.storage_path}`;
    const userName = imageData.user_name || imageData.user_id || "ゲスト";
    const score = Math.round(imageData.total_score);

    const itemEl = document.createElement("div");
    itemEl.className = "ranking-list-item";
    itemEl.innerHTML = `
      <div class="list-rank">${rank}位</div>
      <div class="list-image-container">
        <img src="${imageUrl}" alt="${userName}'s smile" class="list-image">
      </div>
      <div class="list-info">
        <span class="list-name">${userName}</span>
        <span class="list-score">${score}</span>
      </div>
    `;
    listContainer.appendChild(itemEl);

    // Apply portrait class for vertical images
    const imgEl = itemEl.querySelector(".list-image");
    applyImageOrientation(imgEl);
  });
}

/**
 * Detect image orientation and apply appropriate CSS class
 * Portrait images get 'portrait' class for object-fit: contain
 */
function applyImageOrientation(imgElement) {
  imgElement.onload = () => {
    if (imgElement.naturalHeight > imgElement.naturalWidth) {
      imgElement.classList.add("portrait");
    } else {
      imgElement.classList.remove("portrait");
    }
  };
}

/**
 * Update a ranking card with image data
 * @param {number} rank - The rank (1, 2, or 3)
 * @param {object} imageData - The image data from Firestore
 * @param {boolean} useDecimal - Whether to display score with 2 decimal places
 */
function updateRankCard(rank, imageData, useDecimal = false) {
  const card = rankCards[rank];

  if (!imageData) {
    // Empty state - show frame but no data
    card.card.classList.add("empty");
    card.card.classList.add("visible"); // Keep visible to show empty frame
    card.image.src = "";
    card.name.textContent = "-";
    card.score.textContent = "0";
    if (card.comment) {
      card.comment.textContent = "-";
    }
    return;
  }

  // Remove empty state
  card.card.classList.remove("empty");

  // Construct full image URL from storage_path
  const bucketName =
    window.GCS_BUCKET_NAME || "wedding-smile-images-wedding-smile-catcher";
  const imageUrl =
    imageData.storage_url ||
    `https://storage.googleapis.com/${bucketName}/${imageData.storage_path}`;

  // Update content
  card.image.src = imageUrl;
  applyImageOrientation(card.image);
  const userName = imageData.user_name || imageData.user_id || "ゲスト";
  card.image.alt = `${userName}'s smile`;
  card.name.textContent = userName;
  // Display score with decimals for final mode, rounded for recent
  card.score.textContent = useDecimal
    ? imageData.total_score.toFixed(2)
    : Math.round(imageData.total_score);

  // Update AI comment for rank 1 only
  if (card.comment) {
    const rawComment =
      imageData.comment ||
      imageData.ai_comment ||
      imageData.gemini_comment ||
      "すばらしい笑顔です！";
    // Remove existing newlines, add single line break after each sentence (。)
    const comment = rawComment
      .replace(/\n/g, "")
      .replace(/。/g, "。\n")
      .trimEnd();
    card.comment.textContent = comment;
  }

  // Trigger fade-in animation
  setTimeout(() => {
    card.card.classList.add("visible");
  }, rank * 150); // Stagger animations
}

/**
 * Update the ranking display
 */
async function updateRankings(images, useDecimal = false) {
  console.log(`Received ${images.length} images, getting top 3...`);

  // Get top 3 images (no filtering by user)
  const topImages = getTopImages(images, 3);
  console.log(`Top 3 images:`, topImages);

  // Fetch user names for all images
  const userNamesPromises = topImages.map((img) => fetchUserName(img.user_id));
  const userNames = await Promise.all(userNamesPromises);

  // Add user_name to each image data
  topImages.forEach((img, index) => {
    img.user_name = userNames[index];
  });

  // Update state
  currentTop3 = topImages;

  // Update all three ranks
  for (let i = 1; i <= 3; i++) {
    updateRankCard(i, topImages[i - 1], useDecimal);
  }

  // Hide loading
  loadingEl.classList.add("hidden");
}

/**
 * Fetch recent rankings (last 30 images) from Firestore
 */
async function fetchRecentRankings() {
  try {
    const currentEventId = getCurrentEventId();
    console.log(
      `Fetching recent rankings (last 30 images) for event: ${currentEventId}`
    );

    const imagesRef = collection(window.db, "images");
    const q = query(
      imagesRef,
      where("event_id", "==", currentEventId),
      orderBy("upload_timestamp", "desc"),
      limit(30) // Fetch last 30 uploaded images
    );

    const snapshot = await getDocs(q);
    console.log(`Fetched ${snapshot.docs.length} recent documents`);

    let images = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter out images without valid scores (scoring not completed)
    images = images.filter(
      (img) => typeof img.total_score === "number" && !isNaN(img.total_score)
    );

    // Sort by total_score descending
    images.sort((a, b) => b.total_score - a.total_score);

    // Limit same user to max 2 images in top rankings
    const userCount = new Map();
    images = images.filter((img) => {
      const count = userCount.get(img.user_id) || 0;
      if (count >= 2) return false;
      userCount.set(img.user_id, count + 1);
      return true;
    });

    await updateRankings(images);
  } catch (error) {
    console.error("Error fetching recent rankings:", error);
    loadingEl.innerHTML = `
      <div class="spinner"></div>
      <p style="color: #ff6b6b;">Error loading rankings: ${error.message}</p>
    `;
  }
}

/**
 * Fetch all-time top 10 rankings from Firestore
 * - Unique users only (best score per user)
 * - Sort by total_score, then smile_score for tiebreaker
 */
async function fetchAllTimeRankings() {
  try {
    const currentEventId = getCurrentEventId();
    console.log(
      `Fetching all-time top 10 rankings for event: ${currentEventId}`
    );

    const imagesRef = collection(window.db, "images");
    const q = query(
      imagesRef,
      where("event_id", "==", currentEventId),
      orderBy("total_score", "desc"),
      limit(100) // Fetch more to ensure we have unique users
    );

    const snapshot = await getDocs(q);
    console.log(
      `Fetched ${snapshot.docs.length} documents for all-time ranking`
    );

    let images = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter out images without valid scores (scoring not completed)
    images = images.filter(
      (img) => typeof img.total_score === "number" && !isNaN(img.total_score)
    );

    // Sort by total_score desc, then smile_score desc for tiebreaker
    images.sort((a, b) => {
      if (b.total_score !== a.total_score) {
        return b.total_score - a.total_score;
      }
      return (b.smile_score || 0) - (a.smile_score || 0);
    });

    // Unique users only (best score per user)
    const seenUsers = new Set();
    images = images.filter((img) => {
      if (seenUsers.has(img.user_id)) return false;
      seenUsers.add(img.user_id);
      return true;
    });

    // Take top 10
    images = images.slice(0, 10);

    // Fetch user names for all images
    const userNamesPromises = images.map((img) => fetchUserName(img.user_id));
    const userNames = await Promise.all(userNamesPromises);
    images.forEach((img, index) => {
      img.user_name = userNames[index];
    });

    // Update top 3 cards
    const top3 = images.slice(0, 3);
    for (let i = 1; i <= 3; i++) {
      updateRankCard(i, top3[i - 1]);
    }
    loadingEl.classList.add("hidden");

    // Render 4-10 in list format
    const listImages = images.slice(3, 10);
    renderRankingList(listImages, 4);

    // Show ranking list section
    const rankingListSection = document.getElementById("ranking-list");
    if (rankingListSection) {
      rankingListSection.classList.remove("hidden");
    }

    console.log(`Updated all-time top 10 rankings`);
  } catch (error) {
    console.error("Error fetching all-time rankings:", error);
  }
}

// =========================
// Final Presentation Mode Functions
// =========================

/**
 * Fire confetti celebration effect
 */
function fireConfetti() {
  if (typeof confetti !== "function") {
    console.warn("Confetti library not loaded");
    return;
  }

  // Main burst
  confetti({
    particleCount: 200,
    spread: 100,
    origin: { y: 0.6 },
  });

  // Side bursts
  setTimeout(() => {
    confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0 } });
    confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1 } });
  }, 500);

  // Extra celebration
  setTimeout(() => {
    confetti({
      particleCount: 150,
      spread: 120,
      origin: { y: 0.7 },
    });
  }, 1000);
}

/**
 * Show final presentation overlay
 */
function showFinalOverlay() {
  console.log("Showing final presentation overlay");

  // Stop periodic polling
  if (window.rankingIntervalId) {
    clearInterval(window.rankingIntervalId);
    window.rankingIntervalId = null;
    console.log("Stopped periodic polling");
  }

  // Show overlay
  const overlay = document.getElementById("final-overlay");
  overlay.classList.remove("hidden");
}

/**
 * Go back to recent rankings from final mode
 */
function backToRecent() {
  console.log("Going back to recent rankings");

  // Reset final mode flag
  isFinalMode = false;

  // Update label back to recent
  const labelEl = document.getElementById("ranking-label-text");
  const labelContainer = document.querySelector(".ranking-label");
  if (labelEl) {
    labelEl.textContent = "直近30枚のランキング";
  }
  if (labelContainer) {
    labelContainer.classList.remove("final-mode");
  }

  // Hide ranking list (4-10位)
  const rankingListSection = document.getElementById("ranking-list");
  if (rankingListSection) {
    rankingListSection.classList.add("hidden");
  }

  // Toggle buttons
  const finalBtn = document.getElementById("final-btn");
  const backBtn = document.getElementById("back-btn");
  if (finalBtn) finalBtn.classList.remove("hidden");
  if (backBtn) backBtn.classList.add("hidden");

  // Restart periodic polling
  setupPeriodicPolling();
}

/**
 * Start final presentation - triggered by reveal button
 */
async function startFinalPresentation() {
  console.log("Starting final presentation...");

  // Hide overlay
  const overlay = document.getElementById("final-overlay");
  overlay.classList.add("hidden");

  // Hide ranking cards initially for reveal animation
  Object.values(rankCards).forEach((card) => {
    card.card.classList.remove("visible");
  });

  // Update label to show final mode
  const labelEl = document.getElementById("ranking-label-text");
  const labelContainer = document.querySelector(".ranking-label");
  if (labelEl) {
    labelEl.textContent = "全体ランキング";
  }
  if (labelContainer) {
    labelContainer.classList.add("final-mode");
  }

  // Brief pause for dramatic effect
  await new Promise((r) => setTimeout(r, 1500));

  // Set final mode flag
  isFinalMode = true;

  // Toggle buttons (show back, hide final)
  const finalBtn = document.getElementById("final-btn");
  const backBtn = document.getElementById("back-btn");
  if (finalBtn) finalBtn.classList.add("hidden");
  if (backBtn) backBtn.classList.remove("hidden");

  // Fetch and display all-time rankings
  await fetchAllTimeRankings();

  // Fire confetti celebration
  fireConfetti();

  console.log("Final presentation complete");
}

/**
 * Set up final presentation button listeners
 */
function setupFinalButton() {
  const finalBtn = document.getElementById("final-btn");
  if (finalBtn) {
    finalBtn.addEventListener("click", showFinalOverlay);
    console.log("Final button listener set up");
  }

  const revealBtn = document.getElementById("reveal-btn");
  if (revealBtn) {
    revealBtn.addEventListener("click", startFinalPresentation);
    console.log("Reveal button listener set up");
  }

  const backBtn = document.getElementById("back-btn");
  if (backBtn) {
    backBtn.addEventListener("click", backToRecent);
    console.log("Back button listener set up");
  }
}

/**
 * Set up periodic polling (fetch rankings every 10 seconds)
 */
function setupPeriodicPolling() {
  console.log("Setting up periodic polling (every 10 seconds)...");

  // Initial fetch
  fetchRecentRankings();

  // Fetch every 10 seconds
  const intervalId = setInterval(() => {
    // Don't poll in final mode
    if (isFinalMode) return;

    console.log("Periodic update: fetching rankings...");
    fetchRecentRankings();
  }, 10000); // 10000ms = 10 seconds

  // Store interval ID for cleanup
  window.rankingIntervalId = intervalId;

  console.log("Periodic polling set up successfully");
}

/**
 * Initialize the app
 */
function init() {
  console.log("Initializing Wedding Smile Ranking app...");

  // Get event ID from URL or config
  const currentEventId = getCurrentEventId();
  console.log(`Current Event ID: ${currentEventId}`);

  // Check if Firebase is initialized
  if (!window.db) {
    console.error("Firestore not initialized. Check config.js");
    loadingEl.innerHTML = `
      <div class="spinner"></div>
      <p style="color: #ff6b6b;">Firebase not configured</p>
      <p style="font-size: 0.9rem; margin-top: 1rem;">Please update config.js with your Firebase credentials</p>
    `;
    return;
  }

  // Set up final presentation button
  setupFinalButton();

  // Set up periodic polling (every 10 seconds)
  setupPeriodicPolling();
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (window.rankingIntervalId) {
    clearInterval(window.rankingIntervalId);
  }
});

// Start the app
init();
