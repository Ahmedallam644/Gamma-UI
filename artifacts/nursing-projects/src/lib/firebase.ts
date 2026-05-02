import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

declare const __FIREBASE_API_KEY__: string;
declare const __FIREBASE_PROJECT_ID__: string;
declare const __FIREBASE_APP_ID__: string;

const firebaseConfig = {
  apiKey: __FIREBASE_API_KEY__,
  authDomain: `${__FIREBASE_PROJECT_ID__}.firebaseapp.com`,
  projectId: __FIREBASE_PROJECT_ID__,
  appId: __FIREBASE_APP_ID__,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
