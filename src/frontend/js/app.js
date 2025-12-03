import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// State
let currentTop3 = [];

/**
 * Get current event ID from URL parameters or config
 * Supports: ?event_id=wedding_20250315_tanaka
 */
function getCurrentEventId() {
  const params = new URLSearchParams(window.location.search);
  const eventIdFromUrl = params.get('event_id');

  if (eventIdFromUrl) {
    console.log(`Using event_id from URL: ${eventIdFromUrl}`);
    return eventIdFromUrl;
  }

  const defaultEventId = window.CURRENT_EVENT_ID || 'test';
  console.log(`Using default event_id: ${defaultEventId}`);
  return defaultEventId;
}

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
    score: document.getElementById('rank-2-score')
  },
  3: {
    card: document.getElementById('rank-3'),
    image: document.getElementById('rank-3-image'),
    name: document.getElementById('rank-3-name'),
    score: document.getElementById('rank-3-score')
  }
};

// All-time ranking cards (for hall of fame tab)
const rankCardsAll = {
  1: {
    card: document.getElementById('rank-1-all'),
    image: document.getElementById('rank-1-all-image'),
    name: document.getElementById('rank-1-all-name'),
    score: document.getElementById('rank-1-all-score'),
    comment: document.getElementById('rank-1-all-comment')
  },
  2: {
    card: document.getElementById('rank-2-all'),
    image: document.getElementById('rank-2-all-image'),
    name: document.getElementById('rank-2-all-name'),
    score: document.getElementById('rank-2-all-score')
  },
  3: {
    card: document.getElementById('rank-3-all'),
    image: document.getElementById('rank-3-all-image'),
    name: document.getElementById('rank-3-all-name'),
    score: document.getElementById('rank-3-all-score')
  }
};

/**
 * Fetch user name from users collection
 */
async function fetchUserName(userId) {
  try {
    const userRef = doc(window.db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data().name || userId;
    }
    return userId;
  } catch (error) {
    console.error('Error fetching user name:', error);
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
 * Update a ranking card with image data
 * @param {number} rank - The rank (1, 2, or 3)
 * @param {object} imageData - The image data from Firestore
 * @param {object} cards - The card elements to update (rankCards or rankCardsAll)
 * @param {boolean} useDecimal - Whether to display score with 2 decimal places
 */
function updateRankCard(rank, imageData, cards = rankCards, useDecimal = false) {
  const card = cards[rank];

  if (!imageData) {
    // Empty state - show frame but no data
    card.card.classList.add('empty');
    card.card.classList.add('visible'); // Keep visible to show empty frame
    card.image.src = '';
    card.name.textContent = '-';
    card.score.textContent = '0';
    if (card.comment) {
      card.comment.textContent = '-';
    }
    return;
  }

  // Remove empty state
  card.card.classList.remove('empty');

  // Construct full image URL from storage_path
  const bucketName = window.GCS_BUCKET_NAME || 'wedding-smile-images-wedding-smile-catcher';
  const imageUrl = imageData.storage_url ||
                   `https://storage.googleapis.com/${bucketName}/${imageData.storage_path}`;

  // Update content
  card.image.src = imageUrl;
  const userName = imageData.user_name || imageData.user_id || 'ゲスト';
  card.image.alt = `${userName}'s smile`;
  card.name.textContent = userName;
  // Display score with decimals for all-time tab, rounded for recent tab
  card.score.textContent = useDecimal ? imageData.total_score.toFixed(2) : Math.round(imageData.total_score);

  // Update AI comment for rank 1 only
  if (card.comment) {
    const rawComment = imageData.comment || imageData.ai_comment || imageData.gemini_comment || 'すばらしい笑顔です！';
    // Remove existing newlines, add single line break after each sentence (。)
    const comment = rawComment.replace(/\n/g, '').replace(/。/g, '。\n').trimEnd();
    card.comment.textContent = comment;
  }

  // Trigger fade-in animation
  setTimeout(() => {
    card.card.classList.add('visible');
  }, rank * 150); // Stagger animations
}

/**
 * Render ranking list items (4-10位)
 * @param {array} images - Array of image data
 * @param {number} startRank - Starting rank number (default 4)
 * @param {boolean} useDecimal - Whether to display score with 2 decimal places
 */
function renderRankingList(images, startRank = 4, useDecimal = false) {
  const listContainer = document.getElementById('ranking-list-items');
  listContainer.innerHTML = '';

  const bucketName = window.GCS_BUCKET_NAME || 'wedding-smile-images-wedding-smile-catcher';

  images.forEach((imageData, index) => {
    const rank = startRank + index;
    const imageUrl = imageData.storage_url ||
                     `https://storage.googleapis.com/${bucketName}/${imageData.storage_path}`;
    const userName = imageData.user_name || imageData.user_id || 'ゲスト';
    const score = useDecimal ? imageData.total_score.toFixed(2) : Math.round(imageData.total_score);

    const itemEl = document.createElement('div');
    itemEl.className = 'ranking-list-item';
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
  });
}

/**
 * Update the ranking display
 */
async function updateRankings(images) {
  console.log(`Received ${images.length} images, getting top 3...`);

  // Get top 3 images (no filtering by user)
  const topImages = getTopImages(images, 3);
  console.log(`Top 3 images:`, topImages);

  // Fetch user names for all images
  const userNamesPromises = topImages.map(img => fetchUserName(img.user_id));
  const userNames = await Promise.all(userNamesPromises);

  // Add user_name to each image data
  topImages.forEach((img, index) => {
    img.user_name = userNames[index];
  });

  // Update state
  currentTop3 = topImages;

  // Update all three ranks
  for (let i = 1; i <= 3; i++) {
    updateRankCard(i, topImages[i - 1]);
  }

  // Hide loading
  loadingEl.classList.add('hidden');
}

/**
 * Fetch recent rankings (last 30 images) from Firestore
 */
async function fetchRecentRankings() {
  try {
    const currentEventId = getCurrentEventId();
    console.log(`Fetching recent rankings (last 30 images) for event: ${currentEventId}`);

    const imagesRef = collection(window.db, 'images');
    const q = query(
      imagesRef,
      where('event_id', '==', currentEventId),
      orderBy('upload_timestamp', 'desc'),
      limit(30) // Fetch last 30 uploaded images
    );

    const snapshot = await getDocs(q);
    console.log(`Fetched ${snapshot.docs.length} recent documents`);

    let images = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filter out images without valid scores (scoring not completed)
    images = images.filter(img => typeof img.total_score === 'number' && !isNaN(img.total_score));

    // Sort by total_score descending
    images.sort((a, b) => b.total_score - a.total_score);

    // Limit same user to max 2 images in top rankings
    const userCount = new Map();
    images = images.filter(img => {
      const count = userCount.get(img.user_id) || 0;
      if (count >= 2) return false;
      userCount.set(img.user_id, count + 1);
      return true;
    });

    await updateRankings(images);
  } catch (error) {
    console.error('Error fetching recent rankings:', error);
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
 * - Display score with 2 decimal places
 */
async function fetchAllTimeRankings() {
  try {
    const currentEventId = getCurrentEventId();
    console.log(`Fetching all-time top 10 rankings for event: ${currentEventId}`);

    const imagesRef = collection(window.db, 'images');
    const q = query(
      imagesRef,
      where('event_id', '==', currentEventId),
      orderBy('total_score', 'desc'),
      limit(100) // Fetch more to ensure we have 10 unique users
    );

    const snapshot = await getDocs(q);
    console.log(`Fetched ${snapshot.docs.length} documents for all-time ranking`);

    let images = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filter out images without valid scores (scoring not completed)
    images = images.filter(img => typeof img.total_score === 'number' && !isNaN(img.total_score));

    // Sort by total_score desc, then smile_score desc for tiebreaker
    images.sort((a, b) => {
      if (b.total_score !== a.total_score) {
        return b.total_score - a.total_score;
      }
      return (b.smile_score || 0) - (a.smile_score || 0);
    });

    // Unique users only (best score per user)
    const seenUsers = new Set();
    images = images.filter(img => {
      if (seenUsers.has(img.user_id)) return false;
      seenUsers.add(img.user_id);
      return true;
    });

    // Take top 10
    images = images.slice(0, 10);

    // Fetch user names
    const userNamesPromises = images.map(img => fetchUserName(img.user_id));
    const userNames = await Promise.all(userNamesPromises);

    images.forEach((img, index) => {
      img.user_name = userNames[index];
    });

    // Update top 3 in all-time tab (with decimal display)
    for (let i = 1; i <= 3; i++) {
      updateRankCard(i, images[i - 1], rankCardsAll, true);
    }

    // Render 4-10 in list format
    const listImages = images.slice(3, 10);
    renderRankingList(listImages, 4, true);

    console.log(`Updated all-time top 10 rankings`);
  } catch (error) {
    console.error('Error fetching all-time rankings:', error);
  }
}

/**
 * Set up periodic polling (fetch rankings every 1 minute)
 */
function setupPeriodicPolling() {
  console.log('Setting up periodic polling (every 1 minute)...');

  // Initial fetch
  fetchRecentRankings();

  // Fetch every 60 seconds
  const intervalId = setInterval(() => {
    console.log('Periodic update: fetching rankings...');
    fetchRecentRankings();
  }, 60000); // 60000ms = 1 minute

  // Store interval ID for cleanup
  window.rankingIntervalId = intervalId;

  console.log('Periodic polling set up successfully');
}

/**
 * Switch between recent and all-time ranking tabs
 */
function switchTab(tabName) {
  console.log(`Switching to ${tabName} tab`);

  // Update tab buttons
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tab content
  const tabContents = document.querySelectorAll('.tab-content');
  tabContents.forEach(content => {
    if (content.id === `${tabName}-ranking`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Fetch all-time rankings when switching to that tab
  if (tabName === 'all') {
    fetchAllTimeRankings();
  }
}

/**
 * Set up tab button event listeners
 */
function setupTabListeners() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
}

/**
 * Initialize the app
 */
function init() {
  console.log('Initializing Wedding Smile Ranking app...');

  // Get event ID from URL or config
  const currentEventId = getCurrentEventId();
  console.log(`Current Event ID: ${currentEventId}`);

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

  // Set up tab switching
  setupTabListeners();

  // Set up periodic polling (every 1 minute)
  setupPeriodicPolling();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.rankingIntervalId) {
    clearInterval(window.rankingIntervalId);
  }
});

// Start the app
init();
