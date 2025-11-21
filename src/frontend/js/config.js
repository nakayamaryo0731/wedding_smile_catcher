// Firebase Configuration
// TODO: Fill in the Firebase web app configuration from Firebase Console
// Get this from: Firebase Console > Project Settings > Your apps > Web app > Config

window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY", // TODO: Get from Firebase Console
  authDomain: "wedding-smile-catcher.firebaseapp.com",
  projectId: "wedding-smile-catcher",
  storageBucket: "wedding-smile-images-wedding-smile-catcher",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // TODO: Get from Firebase Console
  appId: "YOUR_APP_ID" // TODO: Get from Firebase Console
};

// Alternative: If using environment variables
// Uncomment and set environment variables if deploying to Cloud Run or similar
/*
if (typeof process !== 'undefined' && process.env) {
  window.FIREBASE_CONFIG = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: `${process.env.GCP_PROJECT_ID}.firebaseapp.com`,
    projectId: process.env.GCP_PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  };
}
*/
