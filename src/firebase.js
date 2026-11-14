import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCJ8uBI0LOcnydHKaNDKjttf0o0Ycvvo4A",
  authDomain: "king-5f52e.firebaseapp.com",
  databaseURL: "https://king-5f52e-default-rtdb.firebaseio.com",
  projectId: "king-5f52e",
  storageBucket: "king-5f52e.firebasestorage.app",
  messagingSenderId: "529741965315",
  appId: "1:529741965315:web:0da3cd8edf57dbbe45c636",
  measurementId: "G-JKJYCWNM01"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Enable browserLocalPersistence
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Failed to set auth persistence:", err);
});
