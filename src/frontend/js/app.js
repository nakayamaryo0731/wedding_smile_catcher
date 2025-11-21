import { collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// State
let currentTop3 = [];
let confettiTriggered = false;

// DOM Elements
const loadingEl = document.getElementById('loading');
const rankCards = {
  1: {
    card: document.getElementById('rank-1'),
    image: document.getElementById('rank-1-image'),
    name: document.getElementById('rank-1-name'),
    score: document.getElementById('rank-1-score'),
    comment: document.getElementById('rank-1-comment')
  },
  2: {
    card: document.getElementById('rank-2'),
    image: document.getElementById('rank-2-image'),
    name: document.getElementById('rank-2-name'),
    score: document.getElementById('rank-2-score'),
    comment: document.getElementById('rank-2-comment')
  },
  3: {
    card: document.getElementById('rank-3'),
    image: document.getElementById('rank-3-image'),
    name: document.getElementById('rank-3-name'),
    score: document.getElementById('rank-3-score'),
    comment: document.getElementById('rank-3-comment')
  }
};

/**
 * Filter to unique users from image list
 * Same user cannot appear multiple times in top 3
 */
function filterToUniqueUsers(images) {
  const seenUsers = new Set();
  const uniqueImages = [];

  for (const img of images) {
    if (!seenUsers.has(img.user_id)) {
      seenUsers.add(img.user_id);
      uniqueImages.push(img);

      // Stop after we have 3 unique users
      if (uniqueImages.length >= 3) {
        break;
      }
    }
  }

  return uniqueImages;
}

/**
 * Update a ranking card with image data
 */
function updateRankCard(rank, imageData) {
  const card = rankCards[rank];

  if (!imageData) {
    // Empty state
    card.card.classList.add('empty');
    card.card.classList.remove('visible');
    card.image.src = '';
    card.name.textContent = '-';
    card.score.textContent = '0';
    card.comment.textContent = '-';
    return;
  }

  // Remove empty state
  card.card.classList.remove('empty');

  // Construct full image URL from storage_path
  const bucketName = 'wedding-smile-images-wedding-smile-catcher';
  const imageUrl = imageData.storage_url ||
                   `https://storage.googleapis.com/${bucketName}/${imageData.storage_path}`;

  // Update content
  card.image.src = imageUrl;
  const userName = imageData.user_name || imageData.user_id || 'ゲスト';
  card.image.alt = `${userName}'s smile`;
  card.name.textContent = userName;
  card.score.textContent = Math.round(imageData.total_score);
  card.comment.textContent = imageData.comment || imageData.ai_comment || 'すばらしい笑顔です！';

  // Trigger fade-in animation
  setTimeout(() => {
    card.card.classList.add('visible');
  }, rank * 150); // Stagger animations
}

/**
 * Trigger confetti effect for rank 1
 */
function triggerConfetti() {
  if (confettiTriggered) return;

  confettiTriggered = true;

  const duration = 3000;
  const end = Date.now() + duration;

  const colors = ['#f8b4d9', '#a8d5e2', '#ffd700', '#764ba2', '#667eea'];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: colors
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: colors
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());

  // Reset after 5 seconds so it can trigger again for new #1
  setTimeout(() => {
    confettiTriggered = false;
  }, 5000);
}

/**
 * Update the ranking display
 */
function updateRankings(images) {
  console.log(`Received ${images.length} images, filtering to unique users...`);

  // Filter to unique users (same user can't appear twice)
  const uniqueImages = filterToUniqueUsers(images);
  console.log(`Top 3 unique users:`, uniqueImages);

  // Check if rank 1 changed
  const newRank1Id = uniqueImages[0]?.id;
  const oldRank1Id = currentTop3[0]?.id;
  const rank1Changed = newRank1Id && newRank1Id !== oldRank1Id;

  // Update state
  currentTop3 = uniqueImages;

  // Update all three ranks
  for (let i = 1; i <= 3; i++) {
    updateRankCard(i, uniqueImages[i - 1]);
  }

  // Trigger confetti if rank 1 changed
  if (rank1Changed) {
    console.log('Rank 1 changed! Triggering confetti...');
    triggerConfetti();
  }

  // Hide loading
  loadingEl.classList.add('hidden');
}

/**
 * Set up real-time listener for rankings
 */
function setupRealtimeListener() {
  try {
    console.log('Setting up Firestore real-time listener...');

    const imagesRef = collection(window.db, 'images');
    const q = query(
      imagesRef,
      orderBy('total_score', 'desc'),
      limit(100) // Fetch top 100 to ensure we can filter to 3 unique users
    );

    // Real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Snapshot received: ${snapshot.docs.length} documents`);

      const images = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      updateRankings(images);
    }, (error) => {
      console.error('Error in real-time listener:', error);
      loadingEl.innerHTML = `
        <div class="spinner"></div>
        <p style="color: #ff6b6b;">Error loading rankings: ${error.message}</p>
      `;
    });

    // Store unsubscribe function for cleanup
    window.unsubscribeRankings = unsubscribe;

    console.log('Real-time listener set up successfully');
  } catch (error) {
    console.error('Failed to setup real-time listener:', error);
    loadingEl.innerHTML = `
      <div class="spinner"></div>
      <p style="color: #ff6b6b;">Failed to connect: ${error.message}</p>
      <p style="font-size: 0.9rem; margin-top: 1rem;">Please check Firebase configuration in config.js</p>
    `;
  }
}

/**
 * Initialize the app
 */
function init() {
  console.log('Initializing Wedding Smile Ranking app...');

  // Check if Firebase is initialized
  if (!window.db) {
    console.error('Firestore not initialized. Check config.js');
    loadingEl.innerHTML = `
      <div class="spinner"></div>
      <p style="color: #ff6b6b;">Firebase not configured</p>
      <p style="font-size: 0.9rem; margin-top: 1rem;">Please update config.js with your Firebase credentials</p>
    `;
    return;
  }

  // Set up real-time listener
  setupRealtimeListener();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.unsubscribeRankings) {
    window.unsubscribeRankings();
  }
});

// Start the app
init();
