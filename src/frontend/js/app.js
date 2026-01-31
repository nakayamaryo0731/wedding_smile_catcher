import {
  collection,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =========================
// LP Redirect Check
// =========================
// Redirect to LP if no event_id is specified
(function checkEventIdAndRedirect() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("event_id");
  if (!eventId) {
    window.location.href = "lp.html";
    return;
  }
})();

// State
let currentTop3 = [];
let isFinalMode = false;
let unsubscribeSnapshot = null; // Firestore listener unsubscribe function
let pendingUpdate = null; // For debouncing updates
const UPDATE_DEBOUNCE_MS = 2000; // Debounce updates by 2 seconds
const userNameCache = new Map(); // Cache user names to avoid repeated queries

// Settings State
let currentEventData = null;

// =========================
// Slideshow Mode State & Config
// =========================
const SLIDESHOW_CONFIG = {
  MODE_SWITCH_INTERVAL: 60 * 1000, // 1 minute between mode switches
  IMAGE_SWITCH_INTERVAL: 2500, // 2.5 seconds between image changes
  DISPLAY_COUNT: 6, // Number of images to display simultaneously
  FADE_DURATION: 2000, // Fade animation duration (ms)
  IMAGE_LIMIT: 30, // Number of images to fetch for slideshow
  ROTATION_RANGE: { min: -12, max: 12 }, // Rotation angle range (degrees)
  MARGIN: { top: 0.12, bottom: 0.08, left: 0.05, right: 0.05 }, // Screen margins
  REFRESH_INTERVAL: 10 * 1000, // 10 seconds between image refreshes
};

let slideshowState = {
  currentMode: "ranking", // 'ranking' | 'slideshow' | 'final'
  modeTimerId: null, // Mode switch timer
  imageTimerId: null, // Image rotation timer
  refreshTimerId: null, // Image refresh timer
  imageQueue: [], // Images for slideshow (up to 30)
  displayedImages: [], // Currently displayed images (up to 6)
  displayedPositions: [], // Positions of displayed images
  nextReplaceIndex: 0, // Index of next image to replace
  nextImageIndex: 0, // Index in imageQueue for next image
  autoModeSwitch: true, // Whether auto mode switching is enabled
};

/**
 * Get current event ID from URL parameters
 * Supports: ?event_id=wedding_20250315_tanaka
 * Defaults to "test" if not specified
 */
function getCurrentEventId() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("event_id") || "test";
  console.log(`Using event_id: ${eventId}`);
  return eventId;
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
 * Get user name, preferring denormalized user_name from image data.
 * Falls back to cache or userId if not available.
 */
function getUserName(imageData) {
  if (imageData.user_name) {
    userNameCache.set(imageData.user_id, imageData.user_name);
    return imageData.user_name;
  }
  if (userNameCache.has(imageData.user_id)) {
    return userNameCache.get(imageData.user_id);
  }
  return imageData.user_id || "ゲスト";
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
/**
 * Get image URL from image data, using signed URL only
 * Falls back to empty string if no signed URL is available
 */
function getImageUrl(imageData) {
  if (imageData.storage_url) {
    return imageData.storage_url;
  }
  console.warn(`No signed URL for image: ${imageData.id}`);
  return "";
}

function renderRankingList(images, startRank = 4) {
  const listContainer = document.getElementById("ranking-list-items");
  if (!listContainer) return;

  listContainer.innerHTML = "";

  images.forEach((imageData, index) => {
    const rank = startRank + index;
    const imageUrl = getImageUrl(imageData);
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

  // Use signed URL only (no public URL fallback)
  const imageUrl = getImageUrl(imageData);

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

  // Resolve user names (prefer denormalized user_name from image doc)
  topImages.forEach((img) => {
    img.user_name = getUserName(img);
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
 * Fetch recent rankings (last 15 images) from Firestore
 */
async function fetchRecentRankings() {
  try {
    const currentEventId = getCurrentEventId();
    console.log(
      `Fetching recent rankings (last 15 images) for event: ${currentEventId}`
    );

    const imagesRef = collection(window.db, "images");
    const q = query(
      imagesRef,
      where("event_id", "==", currentEventId),
      orderBy("upload_timestamp", "desc"),
      limit(15) // Fetch last 15 uploaded images
    );

    const snapshot = await getDocs(q);
    console.log(`Fetched ${snapshot.docs.length} recent documents`);

    let images = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter out soft-deleted images and images without valid scores
    images = images.filter(
      (img) =>
        !img.deleted_at &&
        typeof img.total_score === "number" &&
        !isNaN(img.total_score)
    );

    // Sort by total_score descending
    images.sort((a, b) => b.total_score - a.total_score);

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

    // Filter out soft-deleted images and images without valid scores
    images = images.filter(
      (img) =>
        !img.deleted_at &&
        typeof img.total_score === "number" &&
        !isNaN(img.total_score)
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

    // Resolve user names (prefer denormalized user_name from image doc)
    images.forEach((img) => {
      img.user_name = getUserName(img);
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

  // One big dramatic burst from center
  confetti({
    particleCount: 500,
    spread: 180,
    origin: { x: 0.5, y: 0.5 },
    scalar: 1.8,
    gravity: 1.2,
    ticks: 200,
    startVelocity: 60,
  });

  // Side cannons for extra coverage
  confetti({
    particleCount: 250,
    angle: 60,
    spread: 80,
    origin: { x: 0, y: 0.5 },
    scalar: 1.5,
    gravity: 1.4,
    ticks: 175,
    startVelocity: 50,
  });
  confetti({
    particleCount: 250,
    angle: 120,
    spread: 80,
    origin: { x: 1, y: 0.5 },
    scalar: 1.5,
    gravity: 1.4,
    ticks: 175,
    startVelocity: 50,
  });
}

/**
 * Show final presentation overlay
 */
function showFinalOverlay() {
  console.log("Showing final presentation overlay");

  // Stop real-time listener
  stopRealtimeListener();

  // Stop slideshow mode if active
  stopAutoModeSwitch();
  if (slideshowState.currentMode === "slideshow") {
    switchToRanking();
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
  if (labelEl) {
    labelEl.textContent = "直近15枚のランキング";
  }

  // Show QR code again
  setQRCodeVisible(true);

  // Hide ranking list (4-10位)
  const rankingListSection = document.getElementById("ranking-list");
  if (rankingListSection) {
    rankingListSection.classList.add("hidden");
  }

  // Toggle buttons - show final and slideshow, hide ranking
  const finalBtn = document.getElementById("final-btn");
  const slideshowBtn = document.getElementById("slideshow-btn");
  const rankingBtn = document.getElementById("ranking-btn");
  if (finalBtn) finalBtn.classList.remove("hidden");
  if (slideshowBtn) slideshowBtn.classList.remove("hidden");
  if (rankingBtn) rankingBtn.classList.add("hidden");

  // Restart real-time listener
  setupRealtimeListener();

  // Restart automatic mode switching (ranking <-> slideshow)
  startAutoModeSwitch();
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
  if (labelEl) {
    labelEl.textContent = "全体ランキング";
  }

  // Hide QR code during final presentation
  setQRCodeVisible(false);

  // Set final mode flag
  isFinalMode = true;

  // Hide all mode buttons, keep only final hidden
  const finalBtn = document.getElementById("final-btn");
  const slideshowBtn = document.getElementById("slideshow-btn");
  const rankingBtn = document.getElementById("ranking-btn");
  if (finalBtn) finalBtn.classList.add("hidden");
  if (slideshowBtn) slideshowBtn.classList.add("hidden");
  if (rankingBtn) rankingBtn.classList.add("hidden");

  // Brief pause before showing results, then fetch and show with confetti
  await new Promise((r) => setTimeout(r, 1000));
  await fetchAllTimeRankings();
  fireConfetti();

  console.log("Final presentation complete");
}

// =========================
// Final Loading Animation Functions
// =========================

let particlesAnimationId = null;

/**
 * Show the final loading animation
 * @param {string} type - Animation type: "envelope" or "particles"
 */
function showFinalLoadingAnimation(type) {
  const container = document.getElementById("final-loading");
  if (!container) return;

  container.classList.remove("hidden");

  if (type === "envelope") {
    const envelope = document.getElementById("envelope-animation");
    if (envelope) {
      envelope.classList.remove("hidden");
      // Reset animation by removing and re-adding the element
      resetEnvelopeAnimation();
    }
  } else if (type === "particles") {
    const particles = document.getElementById("particles-animation");
    if (particles) {
      particles.classList.remove("hidden");
      startParticlesAnimation();
    }
  }
}

/**
 * Reset envelope animation to play from start
 */
function resetEnvelopeAnimation() {
  const flap = document.querySelector(".envelope-flap");
  const letter = document.querySelector(".envelope-letter");
  const text = document.querySelector(".letter-text");

  if (flap) {
    flap.style.animation = "none";
    flap.offsetHeight; // Trigger reflow
    flap.style.animation = null;
  }
  if (letter) {
    letter.style.animation = "none";
    letter.offsetHeight;
    letter.style.animation = null;
  }
  if (text) {
    text.style.animation = "none";
    text.offsetHeight;
    text.style.animation = null;
  }
}

/**
 * Hide the final loading animation
 */
function hideFinalLoadingAnimation() {
  const container = document.getElementById("final-loading");
  if (container) {
    container.classList.add("hidden");
  }

  const envelope = document.getElementById("envelope-animation");
  if (envelope) {
    envelope.classList.add("hidden");
  }

  const particles = document.getElementById("particles-animation");
  if (particles) {
    particles.classList.add("hidden");
  }

  stopParticlesAnimation();
}

/**
 * Start particles animation using canvas
 */
function startParticlesAnimation() {
  const canvas = document.getElementById("particles-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // Create particles from edges
  for (let i = 0; i < 120; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.max(canvas.width, canvas.height) * 0.8;
    particles.push({
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
      targetX: centerX + (Math.random() - 0.5) * 50,
      targetY: centerY + (Math.random() - 0.5) * 50,
      size: Math.random() * 5 + 2,
      speed: Math.random() * 0.025 + 0.015,
      color: `hsl(${35 + Math.random() * 25}, 100%, ${
        55 + Math.random() * 25
      }%)`,
      trail: [],
    });
  }

  function animate() {
    // Semi-transparent background for trail effect
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let totalDist = 0;

    particles.forEach((p) => {
      // Store trail
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 8) p.trail.shift();

      // Move towards center
      p.x += (p.targetX - p.x) * p.speed;
      p.y += (p.targetY - p.y) * p.speed;

      // Draw trail
      p.trail.forEach((point, idx) => {
        const alpha = (idx / p.trail.length) * 0.5;
        ctx.beginPath();
        ctx.arc(
          point.x,
          point.y,
          p.size * (idx / p.trail.length),
          0,
          Math.PI * 2
        );
        ctx.fillStyle = p.color
          .replace(")", `, ${alpha})`)
          .replace("hsl", "hsla");
        ctx.fill();
      });

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      // Add glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(
        p.x,
        p.y,
        0,
        p.x,
        p.y,
        p.size * 2
      );
      gradient.addColorStop(
        0,
        p.color.replace(")", ", 0.3)").replace("hsl", "hsla")
      );
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fill();

      totalDist += Math.hypot(p.x - centerX, p.y - centerY);
    });

    // Update center glow based on particle proximity
    const glow = document.querySelector(".particles-center-glow");
    if (glow) {
      const maxDist =
        particles.length * Math.max(canvas.width, canvas.height) * 0.8;
      const progress = 1 - totalDist / maxDist;
      const scale = 0.3 + progress * 3;
      const opacity = Math.min(progress * 1.5, 1);
      glow.style.transform = `translate(-50%, -50%) scale(${scale})`;
      glow.style.opacity = opacity;
    }

    particlesAnimationId = requestAnimationFrame(animate);
  }

  animate();
}

/**
 * Stop particles animation
 */
function stopParticlesAnimation() {
  if (particlesAnimationId) {
    cancelAnimationFrame(particlesAnimationId);
    particlesAnimationId = null;
  }

  // Clear canvas
  const canvas = document.getElementById("particles-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Reset glow
  const glow = document.querySelector(".particles-center-glow");
  if (glow) {
    glow.style.transform = "translate(-50%, -50%) scale(0.3)";
    glow.style.opacity = "0";
  }
}

/**
 * Set up header mode buttons (slideshow and ranking)
 */
function setupModeButtons() {
  const slideshowBtn = document.getElementById("slideshow-btn");
  if (slideshowBtn) {
    slideshowBtn.addEventListener("click", () => {
      switchToSlideshow();
      // Reset the auto mode switch timer
      startAutoModeSwitch();
    });
    console.log("Slideshow button listener set up");
  }

  const rankingBtn = document.getElementById("ranking-btn");
  if (rankingBtn) {
    rankingBtn.addEventListener("click", () => {
      switchToRanking();
      // Reset the auto mode switch timer so ranking mode stays for full interval
      startAutoModeSwitch();
    });
    console.log("Ranking button listener set up");
  }

  // Header title click to reload page
  const headerTitle = document.getElementById("header-title-link");
  if (headerTitle) {
    headerTitle.addEventListener("click", () => {
      window.location.reload();
    });
  }
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
}

/**
 * Process snapshot data and update rankings with debouncing
 */
function processSnapshotData(snapshot) {
  // Clear any pending update
  if (pendingUpdate) {
    clearTimeout(pendingUpdate);
  }

  // Debounce: wait for UPDATE_DEBOUNCE_MS before processing
  pendingUpdate = setTimeout(async () => {
    console.log(`Processing ${snapshot.docs.length} documents (debounced)`);

    let images = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter out soft-deleted images and images without valid scores
    images = images.filter(
      (img) =>
        !img.deleted_at &&
        typeof img.total_score === "number" &&
        !isNaN(img.total_score)
    );

    // Sort by total_score descending
    images.sort((a, b) => b.total_score - a.total_score);

    await updateRankings(images);
    pendingUpdate = null;
  }, UPDATE_DEBOUNCE_MS);
}

/**
 * Set up real-time Firestore listener with debouncing
 * Replaces periodic polling for more efficient updates
 */
function setupRealtimeListener() {
  console.log("Setting up real-time Firestore listener...");

  const currentEventId = getCurrentEventId();

  const imagesRef = collection(window.db, "images");
  const q = query(
    imagesRef,
    where("event_id", "==", currentEventId),
    orderBy("upload_timestamp", "desc"),
    limit(15) // Fetch last 15 uploaded images
  );

  // Set up real-time listener
  unsubscribeSnapshot = onSnapshot(
    q,
    (snapshot) => {
      // Don't update in final mode
      if (isFinalMode) return;

      console.log(`Snapshot received: ${snapshot.docs.length} documents`);
      processSnapshotData(snapshot);
    },
    (error) => {
      console.error("Firestore listener error:", error);
      loadingEl.innerHTML = `
        <div class="spinner"></div>
        <p style="color: #ff6b6b;">Error: ${error.message}</p>
      `;
    }
  );

  console.log("Real-time listener set up successfully");
}

/**
 * Stop the real-time listener
 */
function stopRealtimeListener() {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
    console.log("Real-time listener stopped");
  }
  if (pendingUpdate) {
    clearTimeout(pendingUpdate);
    pendingUpdate = null;
  }
}

// =========================
// Slideshow Mode Functions
// =========================

/**
 * Shuffle array in place using Fisher-Yates algorithm
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Fetch images for slideshow (recent 30 images by upload time)
 */
async function fetchSlideshowImages() {
  try {
    const currentEventId = getCurrentEventId();
    console.log(`Fetching slideshow images for event: ${currentEventId}`);

    const imagesRef = collection(window.db, "images");
    const q = query(
      imagesRef,
      where("event_id", "==", currentEventId),
      orderBy("upload_timestamp", "desc"),
      limit(SLIDESHOW_CONFIG.IMAGE_LIMIT)
    );

    const snapshot = await getDocs(q);
    console.log(`Fetched ${snapshot.docs.length} images for slideshow`);

    let images = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter out soft-deleted and incomplete images
    images = images.filter(
      (img) =>
        !img.deleted_at &&
        typeof img.total_score === "number" &&
        !isNaN(img.total_score)
    );

    // Resolve user names (prefer denormalized user_name from image doc)
    images.forEach((img) => {
      img.user_name = getUserName(img);
    });

    // Shuffle for random display order
    shuffleArray(images);

    return images;
  } catch (error) {
    console.error("Error fetching slideshow images:", error);
    return [];
  }
}

/**
 * Refresh slideshow images by fetching new images from server
 * Adds new images to the queue without duplicates
 */
async function refreshSlideshowImages() {
  try {
    const currentEventId = getCurrentEventId();
    console.log(`Refreshing slideshow images for event: ${currentEventId}`);

    const imagesRef = collection(window.db, "images");
    const q = query(
      imagesRef,
      where("event_id", "==", currentEventId),
      orderBy("upload_timestamp", "desc"),
      limit(SLIDESHOW_CONFIG.IMAGE_LIMIT)
    );

    const snapshot = await getDocs(q);
    let newImages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter out soft-deleted and incomplete images
    newImages = newImages.filter(
      (img) =>
        !img.deleted_at &&
        typeof img.total_score === "number" &&
        !isNaN(img.total_score)
    );

    // Find images not already in the queue
    const existingIds = new Set(slideshowState.imageQueue.map((img) => img.id));
    const addedImages = newImages.filter((img) => !existingIds.has(img.id));

    if (addedImages.length > 0) {
      // Resolve user names (prefer denormalized user_name from image doc)
      addedImages.forEach((img) => {
        img.user_name = getUserName(img);
      });

      // Add new images to the queue
      slideshowState.imageQueue.push(...addedImages);
      console.log(
        `Added ${addedImages.length} new images to slideshow queue (total: ${slideshowState.imageQueue.length})`
      );

      // If display has room, add new images directly
      const photoWall = document.getElementById("photo-wall");
      if (
        photoWall &&
        slideshowState.displayedImages.length < SLIDESHOW_CONFIG.DISPLAY_COUNT
      ) {
        const slotsAvailable =
          SLIDESHOW_CONFIG.DISPLAY_COUNT - slideshowState.displayedImages.length;
        const imagesToAdd = addedImages.slice(0, slotsAvailable);

        for (let i = 0; i < imagesToAdd.length; i++) {
          const imageData = imagesToAdd[i];
          const position = calculateRandomPosition(
            slideshowState.displayedImages.length,
            slideshowState.displayedPositions
          );
          const photoElement = createPhotoElement(
            imageData,
            position,
            slideshowState.displayedImages.length + 1
          );
          photoWall.appendChild(photoElement);
          slideshowState.displayedImages.push({ element: photoElement, imageData });
          slideshowState.displayedPositions.push(position);

          // Fade in with stagger
          setTimeout(() => {
            photoElement.classList.add("visible");
          }, i * 150);
        }
        console.log(`Added ${imagesToAdd.length} images to display directly`);
      }

      // Start rotation if not already running and we have enough images
      if (
        !slideshowState.imageTimerId &&
        slideshowState.imageQueue.length > SLIDESHOW_CONFIG.DISPLAY_COUNT
      ) {
        // Set nextImageIndex to the first newly added image
        slideshowState.nextImageIndex =
          slideshowState.imageQueue.length - addedImages.length;
        startImageRotation();
      }
    }
  } catch (error) {
    console.error("Error refreshing slideshow images:", error);
  }
}

/**
 * Calculate position for a photo item using grid-based placement
 * Divides screen into zones (3 columns x 2 rows) to ensure even distribution
 */
function calculateRandomPosition(index, _existingPositions) {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // Photo dimensions (approximate based on CSS)
  const photoWidth = Math.min(screenWidth * 0.28, 480);
  const photoHeight = photoWidth * 0.9; // Aspect ratio + name label

  // Grid layout: 3 columns x 2 rows = 6 zones
  const cols = 3;
  const rows = 2;

  // Available area with margins
  const margin = SLIDESHOW_CONFIG.MARGIN;
  const availableWidth = screenWidth * (1 - margin.left - margin.right);
  const availableHeight = screenHeight * (1 - margin.top - margin.bottom);

  // Zone dimensions
  const zoneWidth = availableWidth / cols;
  const zoneHeight = availableHeight / rows;

  // Determine which zone this image goes into (0-5)
  const zoneIndex = index % (cols * rows);
  const col = zoneIndex % cols;
  const row = Math.floor(zoneIndex / cols);

  // Calculate zone boundaries
  const zoneLeft = screenWidth * margin.left + col * zoneWidth;
  const zoneTop = screenHeight * margin.top + row * zoneHeight;

  // Add small random offset within zone (keep photo inside zone)
  const maxOffsetX = Math.max(0, zoneWidth - photoWidth - 20);
  const maxOffsetY = Math.max(0, zoneHeight - photoHeight - 20);

  const x = zoneLeft + Math.random() * maxOffsetX + 10;
  const y = zoneTop + Math.random() * maxOffsetY + 10;

  // Random rotation
  const rotation =
    SLIDESHOW_CONFIG.ROTATION_RANGE.min +
    Math.random() *
      (SLIDESHOW_CONFIG.ROTATION_RANGE.max -
        SLIDESHOW_CONFIG.ROTATION_RANGE.min);

  return { x, y, rotation, width: photoWidth, height: photoHeight };
}

/**
 * Create a photo item DOM element
 */
function createPhotoElement(imageData, position, zIndex) {
  const imageUrl = getImageUrl(imageData);

  const photoItem = document.createElement("div");
  photoItem.className = "photo-item";
  photoItem.dataset.imageId = imageData.id;
  photoItem.style.cssText = `
    left: ${position.x}px;
    top: ${position.y}px;
    transform: rotate(${position.rotation}deg);
    z-index: ${zIndex};
  `;

  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = `Photo by ${imageData.user_name || "Guest"}`;
  img.onload = () => {
    if (img.naturalHeight > img.naturalWidth) {
      img.classList.add("portrait");
    }
  };
  img.onerror = () => {
    console.warn(`Failed to load image: ${imageUrl}`);
    // Remove the photo item if image fails to load
    photoItem.remove();
  };

  photoItem.appendChild(img);

  return photoItem;
}

/**
 * Initialize slideshow display with initial images
 */
function initializeSlideshowDisplay() {
  const photoWall = document.getElementById("photo-wall");
  const emptyState = document.getElementById("slideshow-empty");

  if (!photoWall) return;

  // Clear existing photos
  photoWall.innerHTML = "";
  slideshowState.displayedImages = [];
  slideshowState.displayedPositions = [];

  // Check if we have images
  if (slideshowState.imageQueue.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  // Display initial images (up to DISPLAY_COUNT)
  const displayCount = Math.min(
    SLIDESHOW_CONFIG.DISPLAY_COUNT,
    slideshowState.imageQueue.length
  );

  for (let i = 0; i < displayCount; i++) {
    const imageData = slideshowState.imageQueue[i];
    const position = calculateRandomPosition(
      i,
      slideshowState.displayedPositions
    );
    const photoElement = createPhotoElement(imageData, position, i + 1);

    photoWall.appendChild(photoElement);
    slideshowState.displayedImages.push({ element: photoElement, imageData });
    slideshowState.displayedPositions.push(position);

    // Stagger fade-in animation
    setTimeout(() => {
      photoElement.classList.add("visible");
    }, i * 150);
  }

  slideshowState.nextImageIndex =
    displayCount % slideshowState.imageQueue.length;
  slideshowState.nextReplaceIndex = 0;

  console.log(`Initialized slideshow with ${displayCount} images`);
}

/**
 * Replace one image in the slideshow
 */
function replaceNextImage() {
  if (
    slideshowState.imageQueue.length === 0 ||
    slideshowState.displayedImages.length === 0
  ) {
    return;
  }

  const photoWall = document.getElementById("photo-wall");
  if (!photoWall) return;

  // Get the image to replace
  const replaceIndex = slideshowState.nextReplaceIndex;
  const oldDisplay = slideshowState.displayedImages[replaceIndex];

  if (!oldDisplay) return;

  // Fade out the old image
  oldDisplay.element.classList.add("exiting");
  oldDisplay.element.classList.remove("visible");

  // Get next image from queue
  const nextImageData =
    slideshowState.imageQueue[slideshowState.nextImageIndex];

  // Calculate new position (excluding the position being replaced)
  const otherPositions = slideshowState.displayedPositions.filter(
    (_, idx) => idx !== replaceIndex
  );
  const newPosition = calculateRandomPosition(replaceIndex, otherPositions);

  // Create new photo element
  const newPhotoElement = createPhotoElement(
    nextImageData,
    newPosition,
    slideshowState.displayedImages.length + 1
  );

  // Remove old element after fade out, add new one
  setTimeout(() => {
    oldDisplay.element.remove();

    photoWall.appendChild(newPhotoElement);
    slideshowState.displayedImages[replaceIndex] = {
      element: newPhotoElement,
      imageData: nextImageData,
    };
    slideshowState.displayedPositions[replaceIndex] = newPosition;

    // Fade in new image
    setTimeout(() => {
      newPhotoElement.classList.add("visible");
    }, 50);
  }, SLIDESHOW_CONFIG.FADE_DURATION);

  // Update indices for next replacement
  slideshowState.nextReplaceIndex =
    (replaceIndex + 1) % slideshowState.displayedImages.length;
  slideshowState.nextImageIndex =
    (slideshowState.nextImageIndex + 1) % slideshowState.imageQueue.length;
}

/**
 * Start the image rotation timer
 */
function startImageRotation() {
  if (slideshowState.imageTimerId) {
    clearInterval(slideshowState.imageTimerId);
  }

  slideshowState.imageTimerId = setInterval(() => {
    replaceNextImage();
  }, SLIDESHOW_CONFIG.IMAGE_SWITCH_INTERVAL);

  console.log("Image rotation started");
}

/**
 * Stop the image rotation timer
 */
function stopImageRotation() {
  if (slideshowState.imageTimerId) {
    clearInterval(slideshowState.imageTimerId);
    slideshowState.imageTimerId = null;
    console.log("Image rotation stopped");
  }
}

/**
 * Switch to slideshow mode
 */
async function switchToSlideshow() {
  console.log("Switching to slideshow mode...");

  slideshowState.currentMode = "slideshow";

  // Fetch fresh images for slideshow
  slideshowState.imageQueue = await fetchSlideshowImages();

  const rankingContent = document.getElementById("ranking-content");
  const slideshowContent = document.getElementById("slideshow-content");

  // Fade out ranking content (header stays visible)
  if (rankingContent) rankingContent.classList.add("fading-out");

  // Show slideshow (it will fade in via CSS transition)
  if (slideshowContent) {
    slideshowContent.classList.remove("hidden");
    slideshowContent.classList.remove("fully-hidden");
  }

  // After fade out completes, hide ranking completely
  setTimeout(() => {
    if (rankingContent) rankingContent.style.visibility = "hidden";
  }, 3000);

  // Toggle header buttons: hide slideshow, show ranking
  const slideshowBtn = document.getElementById("slideshow-btn");
  const rankingBtn = document.getElementById("ranking-btn");
  if (slideshowBtn) slideshowBtn.classList.add("hidden");
  if (rankingBtn) rankingBtn.classList.remove("hidden");

  // Initialize and start slideshow
  initializeSlideshowDisplay();

  // Only start rotation if we have more images than display slots
  if (slideshowState.imageQueue.length > SLIDESHOW_CONFIG.DISPLAY_COUNT) {
    startImageRotation();
  }

  // Start periodic image refresh
  if (slideshowState.refreshTimerId) {
    clearInterval(slideshowState.refreshTimerId);
  }
  slideshowState.refreshTimerId = setInterval(() => {
    refreshSlideshowImages();
  }, SLIDESHOW_CONFIG.REFRESH_INTERVAL);

  console.log("Switched to slideshow mode");
}

/**
 * Switch to ranking mode
 */
function switchToRanking() {
  console.log("Switching to ranking mode...");

  slideshowState.currentMode = "ranking";

  // Stop slideshow
  stopImageRotation();

  // Stop image refresh
  if (slideshowState.refreshTimerId) {
    clearInterval(slideshowState.refreshTimerId);
    slideshowState.refreshTimerId = null;
  }

  const photoWall = document.getElementById("photo-wall");
  const rankingContent = document.getElementById("ranking-content");
  const slideshowContent = document.getElementById("slideshow-content");

  // Fade out slideshow (keep z-index during fade)
  if (slideshowContent) {
    slideshowContent.classList.remove("fully-hidden");
    slideshowContent.classList.add("hidden");
    // After fade completes, lower z-index and clear photos
    setTimeout(() => {
      slideshowContent.classList.add("fully-hidden");
      if (photoWall) photoWall.innerHTML = "";
      slideshowState.displayedImages = [];
      slideshowState.displayedPositions = [];
    }, 3000);
  }

  // Show ranking content and fade in
  if (rankingContent) {
    rankingContent.style.visibility = "";
    rankingContent.classList.remove("fading-out");
  }

  // Toggle header buttons: show slideshow, hide ranking
  const slideshowBtn = document.getElementById("slideshow-btn");
  const rankingBtn = document.getElementById("ranking-btn");
  if (slideshowBtn) slideshowBtn.classList.remove("hidden");
  if (rankingBtn) rankingBtn.classList.add("hidden");

  // Refresh ranking data
  fetchRecentRankings();

  console.log("Switched to ranking mode");
}

/**
 * Toggle between ranking and slideshow modes
 */
function toggleMode() {
  if (isFinalMode) return; // Don't toggle in final mode

  if (slideshowState.currentMode === "ranking") {
    switchToSlideshow();
  } else if (slideshowState.currentMode === "slideshow") {
    switchToRanking();
  }
}

/**
 * Start automatic mode switching
 */
function startAutoModeSwitch() {
  if (slideshowState.modeTimerId) {
    clearInterval(slideshowState.modeTimerId);
  }

  slideshowState.autoModeSwitch = true;

  slideshowState.modeTimerId = setInterval(() => {
    if (slideshowState.autoModeSwitch && !isFinalMode) {
      toggleMode();
    }
  }, SLIDESHOW_CONFIG.MODE_SWITCH_INTERVAL);

  console.log(
    `Auto mode switch started (interval: ${
      SLIDESHOW_CONFIG.MODE_SWITCH_INTERVAL / 1000
    }s)`
  );
}

/**
 * Stop automatic mode switching
 */
function stopAutoModeSwitch() {
  if (slideshowState.modeTimerId) {
    clearInterval(slideshowState.modeTimerId);
    slideshowState.modeTimerId = null;
  }
  slideshowState.autoModeSwitch = false;
  console.log("Auto mode switch stopped");
}

/**
 * Cleanup slideshow resources
 */
function cleanupSlideshow() {
  stopImageRotation();
  stopAutoModeSwitch();
}

// =========================
// Settings Panel Functions
// =========================

/**
 * Show settings panel
 */
function showSettingsPanel() {
  const panel = document.getElementById("settings-panel");
  if (!panel) return;

  panel.classList.remove("hidden");
}

/**
 * Hide settings panel
 */
function hideSettingsPanel() {
  const panel = document.getElementById("settings-panel");
  if (panel) {
    panel.classList.add("hidden");
  }
}

// =========================
// Theme Selection
// =========================

const AVAILABLE_THEMES = [
  // Light themes
  "classic-ivory",
  "soft-blush",
  "soft-peach",
  "sage-green",
  "sky-blue",
  "lavender",
  // Dark themes
  "chocolate",
  "rose-pink",
  "sunset-orange",
  "forest-green",
  "ocean-blue",
  "elegant-purple",
];

/**
 * Get localStorage key for theme (includes event ID for multi-event support)
 */
function getThemeCacheKey() {
  const eventId = currentEventData?.id || new URLSearchParams(window.location.search).get("event");
  return eventId ? `theme_${eventId}` : "theme_default";
}

/**
 * Apply theme to the page
 */
function applyTheme(themeName, saveToCache = true) {
  if (!AVAILABLE_THEMES.includes(themeName)) {
    themeName = "classic-ivory";
  }
  document.documentElement.setAttribute("data-theme", themeName);

  // Update UI selection state
  document.querySelectorAll(".theme-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.theme === themeName);
  });

  // Cache theme in localStorage for instant loading on next visit
  if (saveToCache) {
    try {
      localStorage.setItem(getThemeCacheKey(), themeName);
    } catch (e) {
      // localStorage may be unavailable in some contexts
    }
  }
}

/**
 * Save theme to Firestore
 */
async function saveTheme(themeName) {
  if (!currentEventData?.id) {
    console.warn("No event data available to save theme");
    return;
  }

  try {
    const eventRef = doc(window.db, "events", currentEventData.id);
    await updateDoc(eventRef, { theme: themeName });
    currentEventData.theme = themeName;
  } catch (error) {
    console.error("Failed to save theme:", error);
  }
}

/**
 * Initialize theme selector
 */
function initThemeSelector() {
  const themeButtons = document.querySelectorAll(".theme-option");

  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const themeName = btn.dataset.theme;
      applyTheme(themeName);
      saveTheme(themeName);
    });
  });

  // Apply theme from Firestore data (authoritative source)
  // This also updates localStorage cache if Firestore has a different theme
  if (currentEventData?.theme) {
    applyTheme(currentEventData.theme);
  } else {
    // No theme in Firestore, use default
    applyTheme("forest-green");
  }
}

/**
 * Generate join URL for QR code
 * Uses LIFF URL if LIFF_ID is configured, otherwise falls back to deep link
 */
function generateJoinUrl(eventCode, eventName = "") {
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

/**
 * Generate QR code for the fixed bottom-right display
 */
function generateMainQRCode() {
  if (!currentEventData) return;

  const eventCode = currentEventData.event_code || "";
  const eventName = currentEventData.event_name || "";
  const joinUrl = generateJoinUrl(eventCode, eventName);

  if (typeof QRCode === "undefined") return;

  const container = document.getElementById("main-qr-code");
  if (container) {
    container.innerHTML = "";
    new QRCode(container, {
      text: joinUrl,
      width: 140,
      height: 140,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  console.log("Main QR code generated:", window.LIFF_ID ? "LIFF mode" : "deep link mode");
}

/**
 * Show/hide the fixed QR code
 */
function setQRCodeVisible(visible) {
  const container = document.getElementById("fixed-qr-container");
  if (container) {
    if (visible) {
      container.classList.remove("hidden");
    } else {
      container.classList.add("hidden");
    }
  }
}

/**
 * Download QR code as image (generates a larger QR for printing)
 */
function downloadSettingsQRCode() {
  if (!currentEventData) return;

  const eventCode = currentEventData.event_code || "";
  const eventName = currentEventData.event_name || "";
  const joinUrl = generateJoinUrl(eventCode, eventName);

  // Create a temporary container for high-res QR
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "absolute";
  tempContainer.style.left = "-9999px";
  document.body.appendChild(tempContainer);

  const qr = new QRCode(tempContainer, {
    text: joinUrl,
    width: 512,
    height: 512,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });

  // Wait for QR to render then download
  setTimeout(() => {
    const canvas = tempContainer.querySelector("canvas");
    if (!canvas) {
      document.body.removeChild(tempContainer);
      return;
    }

    const link = document.createElement("a");
    link.download = `qrcode_${eventCode}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    document.body.removeChild(tempContainer);
  }, 100);
}

/**
 * Show confirm modal
 */
function showConfirmModal(message) {
  const modal = document.getElementById("confirm-modal");
  const messageEl = document.getElementById("confirm-message");
  if (modal && messageEl) {
    messageEl.textContent = message;
    modal.classList.remove("hidden");
  }

  return new Promise((resolve) => {
    const yesBtn = document.getElementById("confirm-yes");
    const noBtn = document.getElementById("confirm-no");

    const cleanup = () => {
      yesBtn?.removeEventListener("click", onYes);
      noBtn?.removeEventListener("click", onNo);
      modal?.classList.add("hidden");
    };

    const onYes = () => {
      cleanup();
      resolve(true);
    };
    const onNo = () => {
      cleanup();
      resolve(false);
    };

    yesBtn?.addEventListener("click", onYes);
    noBtn?.addEventListener("click", onNo);
  });
}

/**
 * Soft delete event data (set deleted_at timestamp)
 */
async function softDeleteEventData() {
  const eventId = getCurrentEventId();

  const confirmed = await showConfirmModal("投稿画像を全て削除しますか？");

  if (!confirmed) return;

  const deleteBtn = document.getElementById("delete-data-btn");
  const deleteActionText = deleteBtn?.querySelector(".action-text");
  if (deleteBtn) {
    deleteBtn.disabled = true;
    if (deleteActionText) deleteActionText.textContent = "削除中...";
  }

  try {
    // Get all images for this event that are not already deleted
    const imagesQuery = query(
      collection(window.db, "images"),
      where("event_id", "==", eventId)
    );
    const imagesSnap = await getDocs(imagesQuery);

    // Filter out already deleted images
    const imagesToDelete = imagesSnap.docs.filter(
      (doc) => !doc.data().deleted_at
    );

    if (imagesToDelete.length === 0) {
      alert("削除する画像がありません");
      return;
    }

    const now = serverTimestamp();
    const batchSize = 500;

    // Soft delete images in batches
    for (let i = 0; i < imagesToDelete.length; i += batchSize) {
      const batch = writeBatch(window.db);
      const chunk = imagesToDelete.slice(i, i + batchSize);
      chunk.forEach((docSnap) => {
        batch.update(docSnap.ref, { deleted_at: now });
      });
      await batch.commit();
    }

    alert(`${imagesToDelete.length}枚の画像データを削除しました`);

    // Refresh ranking display
    fetchRecentRankings();
  } catch (error) {
    console.error("Error soft deleting data:", error);
    alert("削除に失敗しました: " + error.message);
  } finally {
    if (deleteBtn) {
      deleteBtn.disabled = false;
      if (deleteActionText) deleteActionText.textContent = "データを削除";
    }
  }
}

/**
 * Download all images as ZIP
 */
async function downloadAllImages() {
  const eventId = getCurrentEventId();
  const downloadBtn = document.getElementById("download-images-btn");
  const actionText = downloadBtn?.querySelector(".action-text");
  const actionDesc = downloadBtn?.querySelector(".action-desc");

  if (downloadBtn) {
    downloadBtn.disabled = true;
    if (actionText) actionText.textContent = "準備中...";
    if (actionDesc) actionDesc.textContent = "";
  }

  try {
    // Fetch all images for this event
    const imagesQuery = query(
      collection(window.db, "images"),
      where("event_id", "==", eventId),
      orderBy("total_score", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(imagesQuery);

    let images = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter out deleted and images without signed URLs
    images = images.filter(
      (img) => !img.deleted_at && img.storage_url
    );

    if (images.length === 0) {
      alert("ダウンロード可能な画像がありません");
      return;
    }

    if (typeof JSZip === "undefined") {
      alert("ZIPライブラリが読み込まれていません。ページを再読み込みしてください。");
      return;
    }

    const zip = new JSZip();
    const imagesFolder = zip.folder("images");
    let downloadedCount = 0;

    // Download images in batches
    const batchSize = 5;
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);

      if (actionText) {
        actionText.textContent = `ダウンロード中 ${Math.min(
          i + batchSize,
          images.length
        )}/${images.length}...`;
      }

      await Promise.all(
        batch.map(async (img) => {
          try {
            const response = await fetch(img.storage_url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();

            const score = (img.total_score || 0).toFixed(0);
            const userName = (img.user_name || img.user_id || "guest")
              .replace(/[<>:"/\\|?*]/g, "_")
              .substring(0, 30);
            const filename = `${String(downloadedCount + 1).padStart(3, "0")}_${userName}_${score}.jpg`;

            imagesFolder.file(filename, blob);
            downloadedCount++;
          } catch (err) {
            console.warn(`Failed to download image ${img.id}:`, err);
          }
        })
      );
    }

    if (downloadedCount === 0) {
      alert("画像のダウンロードに失敗しました");
      return;
    }

    // Generate ZIP
    if (actionText) {
      actionText.textContent = "ZIP作成中...";
    }

    const content = await zip.generateAsync({ type: "blob" });

    // Download
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .slice(0, 15);
    const eventName = (currentEventData?.event_name || "event")
      .replace(/[<>:"/\\|?*]/g, "_")
      .substring(0, 30);
    const zipFilename = `${eventName}_${timestamp}.zip`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = zipFilename;
    link.click();
    URL.revokeObjectURL(link.href);

    alert(`${downloadedCount}枚の画像をダウンロードしました`);
  } catch (error) {
    console.error("Download failed:", error);
    alert("ダウンロードに失敗しました: " + error.message);
  } finally {
    if (downloadBtn) {
      downloadBtn.disabled = false;
      if (actionText) actionText.textContent = "投稿画像を一括ダウンロード";
    }
  }
}


/**
 * Setup settings panel event listeners
 */
function setupSettingsPanel() {
  // Settings button click - directly open settings panel
  const settingsBtn = document.getElementById("settings-btn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", showSettingsPanel);
  }

  // Close settings panel
  document.getElementById("close-settings-panel")?.addEventListener("click", hideSettingsPanel);
  document.getElementById("settings-panel")?.addEventListener("click", (e) => {
    if (e.target.id === "settings-panel") hideSettingsPanel();
  });

  // Download QR code
  document.getElementById("download-qr-btn")?.addEventListener("click", downloadSettingsQRCode);

  // Download images
  document.getElementById("download-images-btn")?.addEventListener("click", downloadAllImages);

  // Delete data
  document.getElementById("delete-data-btn")?.addEventListener("click", softDeleteEventData);
}


/**
 * Initialize the app
 */
async function init() {
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

  // Check event status and store event data
  try {
    const eventDocRef = doc(window.db, "events", currentEventId);
    const eventDoc = await getDoc(eventDocRef);
    if (eventDoc.exists()) {
      currentEventData = { id: eventDoc.id, ...eventDoc.data() };
      const status = currentEventData.status;
      if (status === "archived") {
        console.log(`Event ${currentEventId} is archived, showing ended banner`);
        document.getElementById("event-ended-banner").classList.remove("hidden");
        // Hide everything except header and banner
        document.getElementById("slideshow-btn")?.classList.add("hidden");
        document.getElementById("final-btn")?.classList.add("hidden");
        document.getElementById("ranking-content")?.classList.add("hidden");
        document.getElementById("fixed-qr-container")?.classList.add("hidden");
        loadingEl.classList.add("hidden");
        // Still setup settings panel for archived events (for image download)
        setupSettingsPanel();
        initThemeSelector();
        return;
      }
    }
  } catch (error) {
    console.warn("Failed to check event status:", error);
    // Continue with normal init on error
  }

  // Generate QR code for fixed bottom-right display
  generateMainQRCode();

  // Set up final presentation button
  setupFinalButton();

  // Set up header mode buttons (slideshow/ranking)
  setupModeButtons();

  // Set up settings panel
  setupSettingsPanel();

  // Initialize theme selector
  initThemeSelector();

  // Set up real-time listener (replaces periodic polling)
  setupRealtimeListener();

  // Start automatic mode switching (ranking <-> slideshow)
  startAutoModeSwitch();
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  stopRealtimeListener();
  cleanupSlideshow();
});

// Start the app
init();
