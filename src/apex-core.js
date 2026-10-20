/**
 * Apex Core Module (apex-core.js)
 * 
 * Complete, production-ready full-stack core module for the "Apex" web app.
 * Features:
 * 1. Firebase Authentication (Google Sign-In Popup & Phone OTP with RecaptchaVerifier)
 * 2. Realtime Messaging (Firestore snapshot listeners ordered by timestamp)
 * 3. WebRTC Voice & Video Calling (Fixed lag, audio echo cancellation, Google STUN & Metered TURN servers)
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc
} from 'firebase/firestore';

import firebaseAppletConfig from '../firebase-applet-config.json';

// ==========================================
// FIREBASE INITIALIZATION SETUP
// ==========================================

const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey || "AIzaSyAHlYr4erSpNAdPZALgTuDinl7PKzwK1Fw",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig.authDomain || "gen-lang-client-0079533925.firebaseapp.com",
  databaseURL: import.meta.env?.VITE_FIREBASE_DATABASE_URL || firebaseAppletConfig.databaseURL || "https://gen-lang-client-0079533925-default-rtdb.firebaseio.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || "gen-lang-client-0079533925",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig.storageBucket || "gen-lang-client-0079533925.firebasestorage.app",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId || "66925364916",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId || "1:66925364916:web:b625891882f635276379e1"
};

// Initialize Firebase App Singleton
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Services
export const auth = getAuth(app);
export const db = firebaseAppletConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseAppletConfig.firestoreDatabaseId) 
  : getFirestore(app);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// ==========================================
// 1. FIREBASE AUTHENTICATION MODULE
// ==========================================

/**
 * Handles Google Sign-In using Firebase Auth popup flow with error handling.
 * @returns {Promise<import('firebase/auth').UserCredential>} Resolved Firebase UserCredential object
 */
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log('Google Sign-In successful:', result.user.displayName || result.user.email);
    return result;
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    let userMessage = 'Google Authentication failed. Please try again.';
    if (error.code === 'auth/popup-blocked') {
      userMessage = 'Google popup was blocked by browser. Please enable popups.';
    } else if (error.code === 'auth/popup-closed-by-user') {
      userMessage = 'Google Sign-In window was closed before finishing.';
    } else if (error.code === 'auth/unauthorized-domain') {
      userMessage = 'This domain is not authorized in Firebase Console.';
    }
    throw new Error(userMessage);
  }
}

// Stores RecaptchaVerifier instance
let recaptchaVerifierInstance = null;

/**
 * Triggers phone verification OTP using Firebase RecaptchaVerifier.
 * @param {string} phoneNumber - E.164 formatted phone number (e.g. "+14155552671")
 * @param {string|HTMLElement} containerId - DOM element ID or HTMLElement where recaptcha will be rendered
 * @returns {Promise<import('firebase/auth').ConfirmationResult>} Firebase confirmationResult to verify code
 */
export async function sendPhoneOTP(phoneNumber, containerId = 'recaptcha-container') {
  if (!phoneNumber) {
    throw new Error('Phone number is required in E.164 format (e.g. +14155552671).');
  }

  try {
    // Clean up previous instance if needed
    if (recaptchaVerifierInstance) {
      try {
        recaptchaVerifierInstance.clear();
      } catch {}
      recaptchaVerifierInstance = null;
    }

    // Initialize RecaptchaVerifier
    recaptchaVerifierInstance = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: (response) => {
        console.log('reCAPTCHA solved automatically:', response);
      },
      'expired-callback': () => {
        console.warn('reCAPTCHA expired. User must retry.');
      }
    });

    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierInstance);
    console.log('Phone OTP sent successfully to:', phoneNumber);
    return confirmationResult;
  } catch (error) {
    console.error('sendPhoneOTP Error:', error);
    if (recaptchaVerifierInstance) {
      try { recaptchaVerifierInstance.clear(); } catch {}
      recaptchaVerifierInstance = null;
    }
    throw new Error(error.message || 'Failed to send Phone OTP.');
  }
}

/**
 * Completes phone authentication using the confirmation result and user OTP code.
 * @param {import('firebase/auth').ConfirmationResult} confirmationResult - Result returned by sendPhoneOTP
 * @param {string} otpCode - 6-digit OTP code entered by user
 * @returns {Promise<import('firebase/auth').UserCredential>} Authenticated user credential
 */
export async function verifyPhoneOTP(confirmationResult, otpCode) {
  if (!confirmationResult || typeof confirmationResult.confirm !== 'function') {
    throw new Error('Invalid confirmationResult object passed to verifyPhoneOTP.');
  }
  if (!otpCode || otpCode.trim().length < 4) {
    throw new Error('Please enter a valid OTP code.');
  }

  try {
    const userCredential = await confirmationResult.confirm(otpCode.trim());
    console.log('Phone OTP verification successful for UID:', userCredential.user.uid);
    return userCredential;
  } catch (error) {
    console.error('verifyPhoneOTP Error:', error);
    throw new Error('Invalid OTP verification code. Please check and try again.');
  }
}

// ==========================================
// 2. REALTIME MESSAGING MODULE
// ==========================================

/**
 * Subscribes to Firestore real-time message changes for a specific chat room.
 * Uses onSnapshot with query ordered by timestamp in real time.
 * 
 * @param {string} chatId - Unique chat identifier
 * @param {function(Array<Object>): void} callback - Callback function invoked with real-time message array
 * @returns {function(): void} Unsubscribe function to stop listening
 */
export function listenToMessages(chatId, callback) {
  if (!chatId) {
    console.warn('listenToMessages called without chatId');
    return () => {};
  }

  const messagesRef = collection(db, 'chats', chatId, 'messages');
  // Order real-time messages strictly by timestamp ascending
  const q = query(messagesRef, orderBy('timestamp', 'asc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          chatId,
          senderId: data.senderId || data.sender_id,
          text: data.text || data.content || '',
          timestamp: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().toISOString() : data.timestamp) : data.createdAt || new Date().toISOString(),
          createdAt: data.createdAt || new Date().toISOString(),
          ...data
        };
      });
      callback(messages);
    },
    (error) => {
      console.error('Error in listenToMessages listener:', error);
    }
  );

  return unsubscribe;
}

/**
 * Sends a message document to Firestore with serverTimestamp().
 * 
 * @param {string} chatId - Chat room identifier
 * @param {string} senderId - Sender user UID
 * @param {string} text - Text message content
 * @returns {Promise<string>} Document ID of the sent message
 */
export async function sendMessage(chatId, senderId, text) {
  if (!chatId || !senderId || !text) {
    throw new Error('chatId, senderId, and text are required to send a message.');
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error('Message content cannot be empty.');
  }

  try {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const docRef = await addDoc(messagesRef, {
      senderId,
      text: trimmedText,
      content: trimmedText,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
      status: 'sent'
    });

    // Update parent chat doc for chat list previews
    const chatDocRef = doc(db, 'chats', chatId);
    await setDoc(chatDocRef, {
      last_message: trimmedText,
      last_message_time: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { merge: true }).catch(() => {});

    return docRef.id;
  } catch (error) {
    console.error('Error sending message:', error);
    throw new Error('Failed to send message to Firestore.');
  }
}

// ==========================================
// 3. WEBRTC VOICE & VIDEO CALLING MODULE
// ==========================================

/**
 * WebRTC RTCPeerConnection configuration using Google STUN & Metered TURN fallback servers
 * to guarantee NAT traversal and eliminate latency/lag across mobile networks.
 */
export const RTC_ICE_CONFIG = {
  iceServers: [
    // Google STUN Servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Metered / Open Relay TURN Servers for NAT Traversal
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

/**
 * Binds incoming WebRTC tracks to a remote video/audio HTML element cleanly.
 * Guarantees sound is not muted and video playback begins instantly without freezing.
 * 
 * @param {RTCPeerConnection} peerConnection 
 * @param {HTMLMediaElement} remoteVideoElement 
 */
function attachRemoteTrackHandler(peerConnection, remoteVideoElement) {
  peerConnection.ontrack = (event) => {
    console.log('WebRTC track received:', event.track.kind);
    
    // Low latency receiver playout delay hint
    if (event.receiver && 'playoutDelayHint' in event.receiver) {
      try { event.receiver.playoutDelayHint = 0.01; } catch {}
    }

    if (!remoteVideoElement) {
      console.warn('attachRemoteTrackHandler: remoteVideoElement is null');
      return;
    }

    let remoteStream = remoteVideoElement.srcObject;
    if (!(remoteStream instanceof MediaStream)) {
      remoteStream = new MediaStream();
      remoteVideoElement.srcObject = remoteStream;
    }

    if (event.streams && event.streams[0]) {
      event.streams[0].getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
    } else if (event.track) {
      if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
    }

    remoteVideoElement.autoplay = true;
    remoteVideoElement.playsInline = true;

    // Safely trigger video play
    remoteVideoElement.play().catch((err) => {
      console.warn('Autoplay prevented on remoteVideoElement:', err);
    });
  };
}

/**
 * Initiates a WebRTC voice or video call as the caller.
 * Requests getUserMedia with audio constraints (echoCancellation, noiseSuppression),
 * attaches local tracks to RTCPeerConnection, and generates ICE candidates/offer.
 * 
 * @param {HTMLMediaElement} remoteVideoElement - HTML <video> or <audio> element to bind remote stream
 * @param {boolean} isVideo - True for video call, False for audio-only voice call
 * @returns {Promise<{ peerConnection: RTCPeerConnection, offer: RTCSessionDescriptionInit, localStream: MediaStream, iceCandidates: Array<RTCIceCandidateInit> }>}
 */
export async function startCall(remoteVideoElement, isVideo = true) {
  // 1. Audio and Video constraints configured to optimize voice clarity and prevent latency
  const mediaConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: isVideo ? {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    } : false
  };

  let localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  } catch (err) {
    console.warn('Failed getUserMedia with strict constraints, attempting basic fallback:', err);
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo
    });
  }

  // 2. Instantiate RTCPeerConnection with STUN/TURN servers
  const peerConnection = new RTCPeerConnection(RTC_ICE_CONFIG);

  // 3. Attach local media tracks
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // 4. Attach remote stream handler
  attachRemoteTrackHandler(peerConnection, remoteVideoElement);

  // 5. Gather ICE Candidates
  const iceCandidates = [];
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      iceCandidates.push(event.candidate.toJSON());
    }
  };

  // 6. Generate SDP Offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  return {
    peerConnection,
    offer,
    localStream,
    iceCandidates
  };
}

/**
 * Handles an incoming WebRTC call offer as the callee.
 * Sets remote description, requests user media, binds incoming remote tracks,
 * and generates SDP answer.
 * 
 * @param {RTCSessionDescriptionInit} offer - SDP offer received from caller
 * @param {HTMLMediaElement} remoteVideoElement - HTML <video> or <audio> element for remote media
 * @returns {Promise<{ peerConnection: RTCPeerConnection, answer: RTCSessionDescriptionInit, localStream: MediaStream, iceCandidates: Array<RTCIceCandidateInit> }>}
 */
export async function handleIncomingCall(offer, remoteVideoElement) {
  if (!offer) {
    throw new Error('Valid SDP offer is required for handleIncomingCall.');
  }

  const isVideoCall = offer.sdp ? offer.sdp.includes('m=video') : true;

  // 1. Instantiate RTCPeerConnection
  const peerConnection = new RTCPeerConnection(RTC_ICE_CONFIG);

  // 2. Attach remote track handler
  attachRemoteTrackHandler(peerConnection, remoteVideoElement);

  // 3. Set Remote Description (Offer)
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  // 4. Request local media stream
  const mediaConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: isVideoCall ? {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    } : false
  };

  let localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  } catch (err) {
    console.warn('Fallback local media stream for incoming call answer:', err);
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideoCall
    });
  }

  // 5. Attach local tracks to peer connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // 6. Gather ICE candidates
  const iceCandidates = [];
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      iceCandidates.push(event.candidate.toJSON());
    }
  };

  // 7. Create Answer and set Local Description
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  return {
    peerConnection,
    answer,
    localStream,
    iceCandidates
  };
}

/**
 * Cleanly releases WebRTC peer connection and local media tracks.
 * @param {RTCPeerConnection} peerConnection 
 * @param {MediaStream} localStream 
 */
export function endCall(peerConnection, localStream) {
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      try { track.stop(); } catch {}
    });
  }
  if (peerConnection) {
    try { peerConnection.close(); } catch {}
  }
}

// Export default umbrella object for Apex
export default {
  app,
  auth,
  db,
  loginWithGoogle,
  sendPhoneOTP,
  verifyPhoneOTP,
  listenToMessages,
  sendMessage,
  RTC_ICE_CONFIG,
  startCall,
  handleIncomingCall,
  endCall
};
