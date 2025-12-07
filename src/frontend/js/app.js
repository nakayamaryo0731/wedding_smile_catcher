import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// State
let currentTop3 = [];
let isFinalMode = false;
let unsubscribeSnapshot = null; // Firestore listener unsubscribe function
let pendingUpdate = null; // For debouncing updates
const UPDATE_DEBOUNCE_MS = 2000; // Debounce updates by 2 seconds
const userNameCache = new Map(); // Cache user names to avoid repeated queries

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
 * Fetch user name from users collection with caching
 */
async function fetchUserName(userId) {
  // Check cache first
  if (userNameCache.has(userId)) {
    return userNameCache.get(userId);
  }

  try {
    const userRef = doc(window.db, "users", userId);
    const userSnap = await getDoc(userRef);

    const userName = userSnap.exists() ? userSnap.data().name || userId : userId;

    // Cache the result
    userNameCache.set(userId, userName);
    return userName;
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

  // Restart real-time listener
  setupRealtimeListener();
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

  // Set final mode flag
  isFinalMode = true;

  // Toggle buttons (show back, hide final)
  const finalBtn = document.getElementById("final-btn");
  const backBtn = document.getElementById("back-btn");
  if (finalBtn) finalBtn.classList.add("hidden");
  if (backBtn) backBtn.classList.remove("hidden");

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
      color: `hsl(${35 + Math.random() * 25}, 100%, ${55 + Math.random() * 25}%)`,
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
        ctx.arc(point.x, point.y, p.size * (idx / p.trail.length), 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(")", `, ${alpha})`).replace("hsl", "hsla");
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
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
      gradient.addColorStop(0, p.color.replace(")", ", 0.3)").replace("hsl", "hsla"));
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.fill();

      totalDist += Math.hypot(p.x - centerX, p.y - centerY);
    });

    // Update center glow based on particle proximity
    const glow = document.querySelector(".particles-center-glow");
    if (glow) {
      const maxDist = particles.length * Math.max(canvas.width, canvas.height) * 0.8;
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
    limit(30) // Fetch last 30 uploaded images
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

  // Set up real-time listener (replaces periodic polling)
  setupRealtimeListener();
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  stopRealtimeListener();
});

// Start the app
init();
