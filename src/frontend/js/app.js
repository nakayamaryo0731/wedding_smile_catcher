import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// State
let currentTop3 = [];

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
  const bucketName = 'wedding-smile-images-wedding-smile-catcher';
  const imageUrl = imageData.storage_url ||
                   `https://storage.googleapis.com/${bucketName}/${imageData.storage_path}`;

  // Update content
  card.image.src = imageUrl;
  const userName = imageData.user_name || imageData.user_id || 'ゲスト';
  card.image.alt = `${userName}'s smile`;
  card.name.textContent = userName;
  card.score.textContent = Math.round(imageData.total_score);

  // Update AI comment for rank 1 only
  if (card.comment) {
    // Debug: log available fields
    if (rank === 1) {
      console.log('Rank 1 imageData:', imageData);
      console.log('Available comment fields:', {
        comment: imageData.comment,
        ai_comment: imageData.ai_comment,
        gemini_comment: imageData.gemini_comment
      });
    }

    const comment = imageData.comment || imageData.ai_comment || imageData.gemini_comment || 'すばらしい笑顔です！';
    card.comment.textContent = comment;
  }

  // Trigger fade-in animation
  setTimeout(() => {
    card.card.classList.add('visible');
  }, rank * 150); // Stagger animations
}

/**
 * Update the ranking display
 */
async function updateRankings(images) {
  console.log(`Received ${images.length} images, filtering to unique users...`);

  // Filter to unique users (same user can't appear twice)
  const uniqueImages = filterToUniqueUsers(images);
  console.log(`Top 3 unique users:`, uniqueImages);

  // Fetch user names for all unique users
  const userNamesPromises = uniqueImages.map(img => fetchUserName(img.user_id));
  const userNames = await Promise.all(userNamesPromises);

  // Add user_name to each image data
  uniqueImages.forEach((img, index) => {
    img.user_name = userNames[index];
  });

  // Update state
  currentTop3 = uniqueImages;

  // Update all three ranks
  for (let i = 1; i <= 3; i++) {
    updateRankCard(i, uniqueImages[i - 1]);
  }

  // Hide loading
  loadingEl.classList.add('hidden');
}

/**
 * Fetch latest rankings from Firestore (one-time fetch)
 */
async function fetchRankings() {
  try {
    console.log('Fetching latest rankings from Firestore...');

    const imagesRef = collection(window.db, 'images');
    const q = query(
      imagesRef,
      where('event_id', '==', window.CURRENT_EVENT_ID),
      orderBy('total_score', 'desc'),
      limit(100) // Fetch top 100 to ensure we can filter to 3 unique users
    );

    const snapshot = await getDocs(q);
    console.log(`Fetched ${snapshot.docs.length} documents`);

    const images = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    await updateRankings(images);
  } catch (error) {
    console.error('Error fetching rankings:', error);
    loadingEl.innerHTML = `
      <div class="spinner"></div>
      <p style="color: #ff6b6b;">Error loading rankings: ${error.message}</p>
    `;
  }
}

/**
 * Set up periodic polling (fetch rankings every 1 minute)
 */
function setupPeriodicPolling() {
  console.log('Setting up periodic polling (every 1 minute)...');

  // Initial fetch
  fetchRankings();

  // Fetch every 60 seconds
  const intervalId = setInterval(() => {
    console.log('Periodic update: fetching rankings...');
    fetchRankings();
  }, 60000); // 60000ms = 1 minute

  // Store interval ID for cleanup
  window.rankingIntervalId = intervalId;

  console.log('Periodic polling set up successfully');
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
