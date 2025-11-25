import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, getDocs, query, orderBy, limit, writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const ADMIN_PASSWORD_HASH = '23a68358cb853df2a850e11cbf705979dd65d570e3394b7af0904c2b153fcbb5';

const app = initializeApp(window.FIREBASE_CONFIG);
const db = getFirestore(app);
const auth = getAuth(app);

let selectedItems = {
    images: new Set(),
    users: new Set(),
    events: new Set()
};

let currentTab = 'images';
let pendingDeleteAction = null;

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function checkAuth() {
    return sessionStorage.getItem('adminAuth') === 'true';
}

function setAuth(isAuthenticated) {
    if (isAuthenticated) {
        sessionStorage.setItem('adminAuth', 'true');
    } else {
        sessionStorage.removeItem('adminAuth');
    }
}

async function login(password) {
    const hash = await sha256(password);
    return hash === ADMIN_PASSWORD_HASH;
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById(screenId).style.display = 'block';
}

function showError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
}

async function loadStats() {
    try {
        const imagesSnapshot = await getDocs(collection(db, 'images'));
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const eventsSnapshot = await getDocs(collection(db, 'events'));

        document.getElementById('totalImages').textContent = imagesSnapshot.size;
        document.getElementById('totalUsers').textContent = usersSnapshot.size;
        document.getElementById('totalEvents').textContent = eventsSnapshot.size;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadImages() {
    const container = document.getElementById('imagesList');
    container.innerHTML = '<p class="loading">Loading images...</p>';

    try {
        const q = query(
            collection(db, 'images'),
            orderBy('upload_timestamp', 'desc'),
            limit(500)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p class="loading">No images found</p>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = createDataItem(docSnap.id, {
                'ID': docSnap.id.substring(0, 12) + '...',
                'User': data.user_id || 'N/A',
                'Score': data.total_score ? Math.round(data.total_score) : 'N/A',
                'Status': data.status || 'N/A',
                'Uploaded': data.upload_timestamp ? new Date(data.upload_timestamp.seconds * 1000).toLocaleString('ja-JP') : 'N/A'
            }, 'images');
            container.appendChild(item);
        });

        updateSelectionCount('images');
    } catch (error) {
        console.error('Error loading images:', error);
        container.innerHTML = '<p class="loading">Error loading images</p>';
    }
}

async function loadUsers() {
    const container = document.getElementById('usersList');
    container.innerHTML = '<p class="loading">Loading users...</p>';

    try {
        const q = query(
            collection(db, 'users'),
            orderBy('best_score', 'desc'),
            limit(500)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p class="loading">No users found</p>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = createDataItem(docSnap.id, {
                'ID': docSnap.id.substring(0, 12) + '...',
                'Name': data.name || 'N/A',
                'Uploads': data.total_uploads || 0,
                'Best Score': data.best_score ? Math.round(data.best_score) : 0
            }, 'users');
            container.appendChild(item);
        });

        updateSelectionCount('users');
    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = '<p class="loading">Error loading users</p>';
    }
}

async function loadEvents() {
    const container = document.getElementById('eventsList');
    container.innerHTML = '<p class="loading">Loading events...</p>';

    try {
        const q = query(
            collection(db, 'events'),
            orderBy('created_at', 'desc'),
            limit(500)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p class="loading">No events found</p>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = createDataItem(docSnap.id, {
                'ID': docSnap.id,
                'Name': data.event_name || 'N/A',
                'Status': data.status || 'N/A',
                'Created': data.created_at ? new Date(data.created_at.seconds * 1000).toLocaleString('ja-JP') : 'N/A'
            }, 'events');
            container.appendChild(item);
        });

        updateSelectionCount('events');
    } catch (error) {
        console.error('Error loading events:', error);
        container.innerHTML = '<p class="loading">Error loading events</p>';
    }
}

function createDataItem(id, fields, type) {
    const item = document.createElement('div');
    item.className = 'data-item';
    item.dataset.id = id;
    item.dataset.type = type;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedItems[type].has(id);
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedItems[type].add(id);
        } else {
            selectedItems[type].delete(id);
        }
        updateSelectionCount(type);
    });

    const content = document.createElement('div');
    content.className = 'data-item-content';

    Object.entries(fields).forEach(([label, value]) => {
        const field = document.createElement('div');
        field.className = 'data-field';

        const fieldLabel = document.createElement('div');
        fieldLabel.className = 'data-field-label';
        fieldLabel.textContent = label;

        const fieldValue = document.createElement('div');
        fieldValue.className = 'data-field-value';
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
    document.getElementById(`selected${type.charAt(0).toUpperCase() + type.slice(1)}Count`).textContent = count;
    document.getElementById(`deleteSelected${type.charAt(0).toUpperCase() + type.slice(1)}`).disabled = count === 0;
}

function selectAllItems(type) {
    const container = document.getElementById(`${type}List`);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    const allSelected = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach(checkbox => {
        const item = checkbox.closest('.data-item');
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
    const modal = document.getElementById('confirmModal');
    const message = document.getElementById('confirmMessage');

    message.innerHTML = `Are you sure you want to delete <strong>${count}</strong> ${type}?<br><br>This action cannot be undone.`;

    modal.classList.add('show');

    return new Promise((resolve) => {
        pendingDeleteAction = resolve;
    });
}

function hideConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.remove('show');
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

            chunk.forEach(id => {
                const docRef = doc(db, collectionName, id);
                batch.delete(docRef);
            });

            await batch.commit();
        }

        selectedItems[type].clear();

        if (type === 'images') await loadImages();
        if (type === 'users') await loadUsers();
        if (type === 'events') await loadEvents();

        await loadStats();

        alert(`Successfully deleted ${count} ${type}`);
    } catch (error) {
        console.error('Error deleting items:', error);
        alert(`Error deleting ${type}: ${error.message}`);
    }
}

function switchTab(tabName) {
    currentTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');

    if (tabName === 'images') loadImages();
    if (tabName === 'users') loadUsers();
    if (tabName === 'events') loadEvents();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('passwordInput').value;
    const success = await login(password);

    if (success) {
        try {
            await signInAnonymously(auth);
            setAuth(true);
            showScreen('adminScreen');
            await loadStats();
            await loadImages();
        } catch (error) {
            console.error('Error signing in anonymously:', error);
            showError('Authentication error: ' + error.message);
        }
    } else {
        showError('Invalid password');
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    setAuth(false);
    showScreen('loginScreen');
    document.getElementById('passwordInput').value = '';
    showError('');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
    });
});

document.getElementById('selectAllImages').addEventListener('click', () => selectAllItems('images'));
document.getElementById('selectAllUsers').addEventListener('click', () => selectAllItems('users'));
document.getElementById('selectAllEvents').addEventListener('click', () => selectAllItems('events'));

document.getElementById('deleteSelectedImages').addEventListener('click', () => deleteSelected('images'));
document.getElementById('deleteSelectedUsers').addEventListener('click', () => deleteSelected('users'));
document.getElementById('deleteSelectedEvents').addEventListener('click', () => deleteSelected('events'));

document.getElementById('confirmDelete').addEventListener('click', () => {
    if (pendingDeleteAction) {
        pendingDeleteAction(true);
        hideConfirmModal();
    }
});

document.getElementById('cancelDelete').addEventListener('click', () => {
    if (pendingDeleteAction) {
        pendingDeleteAction(false);
        hideConfirmModal();
    }
});

if (checkAuth()) {
    signInAnonymously(auth).then(() => {
        showScreen('adminScreen');
        loadStats();
        loadImages();
    }).catch((error) => {
        console.error('Error signing in anonymously:', error);
        setAuth(false);
        showScreen('loginScreen');
    });
} else {
    showScreen('loginScreen');
}
