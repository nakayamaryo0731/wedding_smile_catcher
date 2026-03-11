/**
 * Centralized Firebase initialization.
 * All modules import Firebase instances from here instead of initializing independently.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const app = initializeApp(window.FIREBASE_CONFIG);

/** @type {import("firebase/firestore").Firestore} */
export const db = getFirestore(app);

/** @type {import("firebase/auth").Auth} */
export const auth = getAuth(app);

export { app };
