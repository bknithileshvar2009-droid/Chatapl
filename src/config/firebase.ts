import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppletConfig from '../../firebase-applet-config.json';

export const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey || "AIzaSyDrsfnxRT7MmaNdk4pcjOb7mW7Pzy1CvUk",
  authDomain: firebaseAppletConfig.authDomain || "apex-59e5f.firebaseapp.com",
  projectId: firebaseAppletConfig.projectId || "apex-59e5f",
  storageBucket: firebaseAppletConfig.storageBucket || "apex-59e5f.firebasestorage.app",
  messagingSenderId: firebaseAppletConfig.messagingSenderId || "400463759665",
  appId: firebaseAppletConfig.appId || "1:400463759665:web:b30866451f04f64f3f4810",
  measurementId: firebaseAppletConfig.measurementId || "G-SGL4JXLK47"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = firebaseAppletConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseAppletConfig.firestoreDatabaseId) 
  : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
