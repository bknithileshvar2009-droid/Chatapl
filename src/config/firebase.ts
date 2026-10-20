import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppletConfig from '../../firebase-applet-config.json';
import { getEnvVariable } from './apiClient';

export const firebaseConfig = {
  apiKey: getEnvVariable('FIREBASE_API_KEY') || getEnvVariable('API_KEY') || firebaseAppletConfig.apiKey || "AIzaSyAHlYr4erSpNAdPZALgTuDinl7PKzwK1Fw",
  authDomain: getEnvVariable('FIREBASE_AUTH_DOMAIN') || firebaseAppletConfig.authDomain || "gen-lang-client-0079533925.firebaseapp.com",
  databaseURL: getEnvVariable('FIREBASE_DATABASE_URL') || (firebaseAppletConfig as Record<string, string>).databaseURL || "https://gen-lang-client-0079533925-default-rtdb.firebaseio.com",
  projectId: getEnvVariable('FIREBASE_PROJECT_ID') || firebaseAppletConfig.projectId || "gen-lang-client-0079533925",
  storageBucket: getEnvVariable('FIREBASE_STORAGE_BUCKET') || firebaseAppletConfig.storageBucket || "gen-lang-client-0079533925.firebasestorage.app",
  messagingSenderId: getEnvVariable('FIREBASE_MESSAGING_SENDER_ID') || firebaseAppletConfig.messagingSenderId || "66925364916",
  appId: getEnvVariable('FIREBASE_APP_ID') || firebaseAppletConfig.appId || "1:66925364916:web:b625891882f635276379e1",
  measurementId: getEnvVariable('FIREBASE_MEASUREMENT_ID') || firebaseAppletConfig.measurementId || ""
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = firebaseAppletConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseAppletConfig.firestoreDatabaseId) 
  : getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
const googleClientId = getEnvVariable('GOOGLE_CLIENT_ID') || firebaseAppletConfig.oAuthClientId || '276649816564-ivhfpb89ore0d79affapbm9v2rjfgo18.apps.googleusercontent.com';
googleProvider.setCustomParameters({
  client_id: googleClientId,
  prompt: 'select_account'
});
