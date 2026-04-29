// Firebase initialization. Config values are loaded from .env.local (see .env.example).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Sanity check at boot — fail loudly if env vars missing
const required: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];
for (const k of required) {
  if (!firebaseConfig[k]) {
    throw new Error(
      `Missing Firebase config: VITE_FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}.\n` +
        `Copy .env.example to .env.local and fill in the values from the Firebase console.`
    );
  }
}

export const ALLOWED_DOMAIN: string = import.meta.env.VITE_ALLOWED_DOMAIN || 'smartosc.com';

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: 'select_account' });
