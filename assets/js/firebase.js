import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBTI3nR4CA5HdVGeP3zg7YibS2kfEvcCNc",
  authDomain: "catatan-pengeluaran-keua-19af4.firebaseapp.com",
  databaseURL: "https://catatan-pengeluaran-keua-19af4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "catatan-pengeluaran-keua-19af4",
  storageBucket: "catatan-pengeluaran-keua-19af4.firebasestorage.app",
  messagingSenderId: "582629555317",
  appId: "1:582629555317:web:4e8a943c221f53f96bcc3c",
  measurementId: "G-GDWT3NWNMH"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

await setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Auth persistence fallback:", error);
});

let firestoreInstance;

try {
  firestoreInstance = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  firestoreInstance = getFirestore(firebaseApp);
}

export const db = firestoreInstance;
