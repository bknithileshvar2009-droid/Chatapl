import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  updateProfile as updateFirebaseProfile,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  onSnapshot,
  orderBy,
  serverTimestamp,
  deleteDoc,
  arrayUnion
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../config/firebase';
import { Profile, Room, Message, MessageReaction } from '../types';
import { chatEngine } from './chatEngine';
import { playSound } from '../utils/sound';
import { encryptMessage, decryptMessage, getRoomChannelKey } from '../utils/crypto';

export class FirebaseAuthService {
  /**
   * 1. Sign Up with Username & Password
   */
  async signUpWithUsername(
    usernameInput: string,
    passwordInput: string,
    displayNameInput?: string,
    avatarUrlInput?: string,
    isSearchable: boolean = true,
    emailInput?: string
  ): Promise<Profile> {
    const cleanUsername = usernameInput.trim().toLowerCase().replace(/^@+/, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      throw new Error("Username must be at least 3 characters long.");
    }

    // Step 1: Check username availability in Firestore 'usernames' collection
    const usernameDocRef = doc(db, 'usernames', cleanUsername);
    const usernameSnap = await getDoc(usernameDocRef);

    if (usernameSnap.exists()) {
      throw new Error(`Username @${cleanUsername} is already taken. Please choose another.`);
    }

    // Mapped internal email format or custom email for Firebase Auth
    const cleanCustomEmail = emailInput?.trim().toLowerCase();
    const mappedEmail = (cleanCustomEmail && cleanCustomEmail.includes('@'))
      ? cleanCustomEmail
      : `${cleanUsername}@app.internal`;

    // Step 2: Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, mappedEmail, passwordInput);
    const uid = userCredential.user.uid;

    const defaultAvatar = avatarUrlInput || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250';
    const finalDisplayName = displayNameInput?.trim() || cleanUsername;

    // Step 3: Write Username -> Email mapping in Firestore
    await setDoc(usernameDocRef, {
      uid,
      email: mappedEmail,
      username: cleanUsername,
      created_at: serverTimestamp()
    });

    // Step 4: Write User Profile document in Firestore 'users' collection
    const newProfile: Profile = {
      id: uid,
      username: cleanUsername,
      display_name: finalDisplayName,
      bio: 'Hey there! I am using Nex Chat.',
      avatar_url: defaultAvatar,
      is_private: !isSearchable,
      isSearchable,
      is_online: true,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      email: mappedEmail
    };

    await setDoc(doc(db, 'users', uid), {
      ...newProfile,
      uid,
      // Ensure consistency with search pattern
      username_lowercase: cleanUsername
    });

    // Update Firebase Auth display info
    try {
      await updateFirebaseProfile(userCredential.user, {
        displayName: finalDisplayName,
        photoURL: defaultAvatar
      });
    } catch {
      // Non-fatal if photo URL update fails
    }

    return newProfile;
  }

  /**
   * 2. Login with Username & Password
   */
  async loginWithUsername(usernameInput: string, passwordInput: string): Promise<Profile> {
    const cleanUsername = usernameInput.trim().toLowerCase().replace(/^@/, '');
    if (!cleanUsername) {
      throw new Error("Please enter your @username.");
    }

    // Step 1: Lookup internal email mapping in Firestore
    const usernameDocRef = doc(db, 'usernames', cleanUsername);
    const usernameSnap = await getDoc(usernameDocRef);

    let mappedEmail = `${cleanUsername}@app.internal`;

    if (usernameSnap.exists()) {
      mappedEmail = usernameSnap.data().email || mappedEmail;
    } else if (cleanUsername.includes('@')) {
      // Input was an email
      mappedEmail = cleanUsername;
    } else {
      throw new Error(`User @${cleanUsername} does not exist. Please check your username or sign up.`);
    }

    // Step 2: Authenticate with Firebase Auth
    try {
      const userCredential = await signInWithEmailAndPassword(auth, mappedEmail, passwordInput);
      const uid = userCredential.user.uid;

      // Fetch Profile from Firestore 'users' collection
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const profileData = userSnap.data() as Profile;
        // Update online status
        await updateDoc(userDocRef, {
          is_online: true,
          last_seen: new Date().toISOString()
        });
        return { ...profileData, id: uid, is_online: true };
      }

      // Fallback Profile if document missing
      return {
        id: uid,
        username: cleanUsername,
        display_name: userCredential.user.displayName || cleanUsername,
        bio: 'Hey there!',
        avatar_url: userCredential.user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
        is_private: false,
        isSearchable: true,
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email: mappedEmail
      };
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        throw new Error(`Incorrect password for @${cleanUsername}. Please try again.`);
      } else if (err.code === 'auth/user-not-found') {
        throw new Error(`User @${cleanUsername} not found.`);
      }
      throw new Error(err.message || `Authentication failed for @${cleanUsername}.`);
    }
  }

  /**
   * Helper to sync Google user to Firestore profile
   */
  private async syncGoogleUserProfile(user: any): Promise<Profile> {
    const uid = user.uid;
    const email = user.email || `${uid}@gmail.com`;
    // Consistent sanitization
    const rawUsername = email.split('@')[0];
    const cleanUsername = rawUsername.trim().toLowerCase().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '_');

    // Create username mapping if not present
    const usernameDocRef = doc(db, 'usernames', cleanUsername);
    const usernameSnap = await getDoc(usernameDocRef);
    if (!usernameSnap.exists()) {
      await setDoc(usernameDocRef, {
        uid,
        email,
        username: cleanUsername,
        created_at: new Date().toISOString()
      });
    }

    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    let profile: Profile;
    if (userSnap.exists()) {
      profile = { ...userSnap.data(), id: uid, is_online: true } as Profile;
      await updateDoc(userDocRef, { is_online: true, last_seen: new Date().toISOString() });
    } else {
      profile = {
        id: uid,
        username: cleanUsername,
        display_name: user.displayName || cleanUsername,
        bio: 'Nex Chat User (Google Verified)',
        avatar_url: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
        is_private: false,
        isSearchable: true,
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email,
        is_google_protected: true
      };
      await setDoc(userDocRef, { 
        ...profile, 
        uid, 
        username_lowercase: cleanUsername 
      });
    }

    return profile;
  }

  /**
   * Check for Google Redirect Auth result on load
   */
  async checkRedirectResult(): Promise<Profile | null> {
    try {
      const result = await getRedirectResult(auth);
      if (result && result.user) {
        return await this.syncGoogleUserProfile(result.user);
      }
    } catch (err: any) {
      console.warn('Google Redirect Result error:', err);
    }
    return null;
  }

  /**
   * 3. Google / Gmail Sign In with Popup & Fallback to Redirect
   */
  async loginWithGoogle(): Promise<Profile> {
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      return await this.syncGoogleUserProfile(userCredential.user);
    } catch (err: any) {
      console.warn('Google Popup Auth failed, attempting redirect fallback:', err);
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        try {
          await signInWithRedirect(auth, googleProvider);
          // Handled on page reload via checkRedirectResult
          throw new Error('Redirecting to Google Sign-In...');
        } catch (redirectErr: any) {
          throw new Error('Google Sign-In popup was blocked by browser. Please enable popups or try again.');
        }
      } else if (err.code === 'auth/unauthorized-domain') {
        throw new Error('Unauthorized domain for Google Auth. Please add this domain in Firebase Console.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        throw new Error('Google Sign-In popup was closed before completing.');
      } else if (err.code === 'auth/operation-not-allowed') {
        throw new Error('Google Sign-In method is not enabled in Firebase Authentication.');
      }
      throw new Error(err.message || 'Google Authentication failed. Please try again.');
    }
  }

  /**
   * 4. Account Settings Page Update
   */
  async updateAccountSettings(
    uid: string,
    updates: {
      displayName?: string;
      avatarUrl?: string;
      isSearchable?: boolean;
      bio?: string;
      newPassword?: string;
    }
  ): Promise<void> {
    const userDocRef = doc(db, 'users', uid);
    const docUpdates: any = {
      updated_at: new Date().toISOString()
    };

    if (updates.displayName !== undefined) docUpdates.display_name = updates.displayName;
    if (updates.avatarUrl !== undefined) docUpdates.avatar_url = updates.avatarUrl;
    if (updates.bio !== undefined) docUpdates.bio = updates.bio;
    if (updates.isSearchable !== undefined) {
      docUpdates.isSearchable = updates.isSearchable;
      docUpdates.is_private = !updates.isSearchable;
    }

    await updateDoc(userDocRef, docUpdates);

    // Update Firebase Auth password if requested
    if (updates.newPassword && auth.currentUser) {
      await updatePassword(auth.currentUser, updates.newPassword);
    }
  }

  /**
   * Sync user profile to Firestore
   */
  async syncUserProfile(profile: Profile): Promise<void> {
    if (!profile || !profile.id) return;
    try {
      const cleanUsername = profile.username.trim().toLowerCase().replace(/^@+/, '');
      const userDocRef = doc(db, 'users', profile.id);
      await setDoc(
        userDocRef,
        {
          id: profile.id,
          uid: profile.id,
          username: cleanUsername,
          username_lowercase: cleanUsername,
          display_name: profile.display_name || profile.username || 'User',
          avatar_url: profile.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
          bio: profile.bio || 'Hey there!',
          isSearchable: profile.is_private ? false : true,
          is_private: !!profile.is_private,
          is_online: true,
          last_seen: new Date().toISOString(),
          created_at: profile.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          email: profile.email || ''
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Sync user profile to Firestore error:', err);
    }
  }

  /**
   * Subscribe to all registered user profiles in real-time
   */
  subscribeToAllUsers(onUsersChanged?: (users: Profile[]) => void): () => void {
    const usersCol = collection(db, 'users');
    return onSnapshot(
      usersCol,
      (snapshot) => {
        const profiles: Profile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const pId = docSnap.id;
          const profile: Profile = {
            id: pId,
            username: data.username || pId,
            display_name: data.display_name || data.username || 'User',
            bio: data.bio || '',
            avatar_url: data.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
            is_private: !!data.is_private,
            isSearchable: data.isSearchable !== false,
            is_online: data.is_online ?? true,
            last_seen: data.last_seen || new Date().toISOString(),
            created_at: data.created_at || new Date().toISOString(),
            updated_at: data.updated_at || new Date().toISOString(),
            email: data.email || ''
          };
          profiles.push(profile);
          chatEngine.saveProfile(profile);
        });
        if (onUsersChanged) {
          onUsersChanged(profiles);
        }
      },
      (err) => {
        console.warn('Real-time users snapshot listener warning:', err);
      }
    );
  }

  /**
   * 5. User Search by @username or display name (Real-time Firestore Users)
   */
  async searchUsers(searchQuery: string = '', currentUid: string = ''): Promise<Profile[]> {
    const clean = searchQuery.trim().toLowerCase().replace(/^@+/, '');
    if (!clean || clean.length < 2) return [];

    const usersCol = collection(db, 'users');
    
    // Prefix matching query for 'username' field (which is already lowercase)
    const q = query(
      usersCol,
      where('username', '>=', clean),
      where('username', '<=', clean + '\uf8ff')
    );

    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch (err) {
      console.warn('Firestore getDocs search users warning:', err);
      return [];
    }

    const results: Profile[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const pId = docSnap.id;
      if (pId === currentUid) return;

      const profile: Profile = {
        id: pId,
        username: data.username || pId,
        display_name: data.display_name || data.username || 'User',
        bio: data.bio || '',
        avatar_url: data.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
        is_private: !!data.is_private,
        isSearchable: data.isSearchable !== false,
        is_online: data.is_online ?? true,
        last_seen: data.last_seen || new Date().toISOString(),
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
        email: data.email || ''
      };

      // Ensure profile is cached locally
      chatEngine.saveProfile(profile);

      // Final client-side check if necessary (e.g. private profile restriction)
      if (profile.is_private) {
        if (profile.username === clean) {
          results.push(profile);
        }
      } else {
        results.push(profile);
      }
    });

    return results;
  }

  /**
   * 6. Direct Messaging & Chat Room creation
   */
  async getOrCreateDirectChat(currentUid: string, targetUid: string): Promise<string> {
    const directChatId = [currentUid, targetUid].sort().join('_direct_');
    try {
      const chatRef = doc(db, 'chats', directChatId);
      await setDoc(chatRef, {
        participants: [currentUid, targetUid],
        is_group: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Error in getOrCreateDirectChat setDoc:', err);
    }

    return directChatId;
  }

  /**
   * Ensure Firestore public room exists and currentUid is enrolled in participants (Disabled)
   */
  async ensureFirestorePublicRoom(_currentUid: string): Promise<void> {
    // Disabled as requested
    return;
  }

  /**
   * Real-time User Chats Subscription
   */
  subscribeToUserChats(
    currentUid: string,
    onRoomsChange: (rooms: Room[]) => void
  ): () => void {
    if (!currentUid) {
      return () => {};
    }

    const chatsCol = collection(db, 'chats');
    const q = query(chatsCol, where('participants', 'array-contains', currentUid));

    return onSnapshot(q, async (snapshot) => {
      const roomPromises = snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const participantIds: string[] = Array.isArray(data.participants) ? data.participants : [];
        
        const profilePromises = participantIds.map(async (pUid) => {
          try {
            const userSnap = await getDoc(doc(db, 'users', pUid));
            if (userSnap.exists()) {
              return { ...userSnap.data(), id: pUid } as Profile;
            }
          } catch {}
          return null;
        });

        const profiles = (await Promise.all(profilePromises)).filter((p): p is Profile => p !== null);

        let roomName = data.group_name || '';
        if (!data.is_group) {
          const otherProf = profiles.find(p => p.id !== currentUid);
          roomName = otherProf?.display_name || 'Chat';
        }

        const channelKey = getRoomChannelKey(docSnap.id);
        const rawLastMsg = data.last_message || '';
        const decryptedLastMsg = rawLastMsg ? decryptMessage(rawLastMsg, channelKey) : '';

        // Calculate unread message count by tracking user's last read timestamp
        const lastReadMap = data.last_read_at || data.lastReadAt || {};
        const userLastReadStr = lastReadMap[currentUid];
        const userLastReadTime = userLastReadStr ? new Date(userLastReadStr).getTime() : 0;

        let unreadCount = 0;
        try {
          const messagesCol = collection(db, 'chats', docSnap.id, 'messages');
          const msgSnap = await getDocs(messagesCol);
          msgSnap.forEach((mSnap) => {
            const mData = mSnap.data();
            const senderId = mData.sender_id || mData.uid || mData.senderId;
            if (senderId && senderId !== currentUid) {
              const msgCreatedTime = mData.created_at ? new Date(mData.created_at).getTime() : 0;
              const isUnreadStatus = mData.status !== 'read';
              const isAfterLastRead = userLastReadStr ? msgCreatedTime > userLastReadTime : isUnreadStatus;
              if (isUnreadStatus || isAfterLastRead) {
                unreadCount++;
              }
            }
          });
        } catch (e: any) {
          if (e?.code === 'unavailable' || e?.message?.includes('offline')) {
            // Quietly ignore unread count error when offline
          } else {
            console.warn('Warning calculating unread count in subscribeToUserChats:', e?.message || e);
          }
        }

        const room: Room = {
          id: docSnap.id,
          name: roomName,
          is_group: !!data.is_group,
          group_icon: data.group_icon,
          participant_profiles: profiles,
          created_by: data.created_by || currentUid,
          created_at: data.created_at || new Date().toISOString(),
          updated_at: data.updated_at || data.last_message_time || new Date().toISOString(),
          last_message_text: decryptedLastMsg,
          last_message_time: data.last_message_time || data.created_at || new Date().toISOString(),
          adminUids: data.adminUids || [],
          unread_count: unreadCount
        };

        return room;
      });

      const rooms = await Promise.all(roomPromises);
      rooms.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      onRoomsChange(rooms);
    }, (err: any) => {
      if (err?.code === 'unavailable' || err?.message?.includes('offline')) {
        console.warn('Firestore user chats subscription offline:', err?.message || err);
      } else {
        console.warn('Firestore user chats subscription warning:', err?.message || err);
      }
    });
  }

  /**
   * 7. Real-time Messages Document Snapshot Listener with playSound trigger & AES Decryption
   */
  subscribeToChatMessages(
    chatId: string,
    currentUid: string,
    onMessagesChange: (messages: Message[]) => void
  ) {
    if (!chatId || !currentUid) {
      return () => {};
    }

    const messagesCol = collection(db, 'chats', chatId, 'messages');
    const channelKey = getRoomChannelKey(chatId);

    let isInitialLoad = true;

    return onSnapshot(messagesCol, (snapshot) => {
      const messages: Message[] = [];

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isInitialLoad) {
          const data = change.doc.data();
          const senderId = data.sender_id || data.uid || data.senderId;
          if (senderId && senderId !== currentUid) {
            playSound('incoming');
          }
        }
        if (change.type === 'modified') {
          const data = change.doc.data();
          console.log(`[Firestore message update event] Message ${change.doc.id} modified: status=${data.status}, readAt=${data.readAt}`);
        }
      });

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawContent = data.content || data.text || '';
        const msgType = data.type || 'text';
        const decryptedContent = (msgType === 'text') ? decryptMessage(rawContent, channelKey) : rawContent;

        messages.push({
          id: docSnap.id,
          room_id: chatId,
          sender_id: data.sender_id || data.uid || data.senderId,
          content: data.isDeleted ? 'This message was deleted' : decryptedContent,
          type: msgType,
          attachment_url: data.attachment_url || data.attachmentUrl,
          audio_duration: data.audio_duration,
          reply_to_id: data.reply_to_id || data.replyToId,
          status: data.status || 'delivered',
          deliveredAt: data.deliveredAt,
          readAt: data.readAt,
          isDeleted: !!data.isDeleted,
          created_at: data.created_at || new Date().toISOString(),
          reactions: Array.isArray(data.reactions) ? data.reactions : []
        });
      });

      messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      isInitialLoad = false;
      onMessagesChange(messages);
    }, (error: any) => {
      if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
        console.warn('Firestore chat messages subscription offline:', error?.message || error);
      } else {
        console.warn('Firestore chat messages snapshot warning:', error?.message || error);
      }
    });
  }

  /**
   * Set typing status in Firestore for a user in a chat
   */
  async setFirestoreTyping(chatId: string, userId: string, isTyping: boolean): Promise<void> {
    if (!auth.currentUser) return;
    try {
      const typingDocRef = doc(db, 'chats', chatId, 'typing', userId);
      if (isTyping) {
        await setDoc(typingDocRef, {
          isTyping: true,
          updatedAt: new Date().toISOString()
        });
      } else {
        await deleteDoc(typingDocRef);
      }
    } catch (err) {
      // Silently handle transient network/auth errors
    }
  }

  /**
   * Subscribe to typing status changes for a chat in Firestore
   */
  subscribeToTyping(
    chatId: string,
    currentUid: string,
    onTypingUsersChange: (typingUserIds: string[]) => void
  ): () => void {
    if (!auth.currentUser) return () => {};
    const typingCol = collection(db, 'chats', chatId, 'typing');
    return onSnapshot(typingCol, (snapshot) => {
      const typingUserIds: string[] = [];
      const now = Date.now();
      snapshot.forEach((docSnap) => {
        const uId = docSnap.id;
        if (uId !== currentUid) {
          const data = docSnap.data();
          const updatedAt = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
          if (data.isTyping && (now - updatedAt < 6000)) {
            typingUserIds.push(uId);
          }
        }
      });
      onTypingUsersChange(typingUserIds);
    }, (err) => {
      // Graceful fallback for unauthenticated or local sessions
    });
  }

  /**
   * Send Client-Side AES Encrypted Message to Firestore
   */
  async sendFirestoreMessage(
    chatId: string,
    senderId: string,
    content: string,
    type: string = 'text',
    attachmentUrl?: string,
    replyToId?: string,
    audioDuration?: number,
    participantIds?: string[]
  ): Promise<string> {
    const channelKey = getRoomChannelKey(chatId);
    const encryptedContent = (type === 'text') ? encryptMessage(content, channelKey) : content;

    const messagesCol = collection(db, 'chats', chatId, 'messages');
    const docRef = await addDoc(messagesCol, {
      sender_id: senderId,
      content: encryptedContent,
      type,
      attachment_url: attachmentUrl || null,
      audio_duration: audioDuration || null,
      reply_to_id: replyToId || null,
      created_at: new Date().toISOString(),
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      isDeleted: false,
      reactions: []
    });

    const now = new Date().toISOString();

    const chatRef = doc(db, 'chats', chatId);
    let chatSnap: any = null;
    try {
      chatSnap = await getDoc(chatRef);
    } catch (e) {
      // Handle offline or transient read failure
    }

    let existingParts: string[] = [];
    if (chatSnap && chatSnap.exists() && Array.isArray(chatSnap.data()?.participants)) {
      existingParts = chatSnap.data()?.participants;
    }

    let directParts: string[] = [];
    if (chatId.includes('_direct_')) {
      directParts = chatId.split('_direct_').filter(Boolean);
    }

    let extraParts: string[] = [];
    if (typeof window !== 'undefined') {
      try {
        const rawParts = JSON.parse(localStorage.getItem('apex_chat_room_participants_v1') || '[]');
        extraParts = rawParts.filter((p: any) => p.room_id === chatId).map((p: any) => p.user_id);
      } catch {}
    }

    const mergedPartsSet = new Set<string>([
      ...existingParts,
      ...directParts,
      ...extraParts,
      senderId,
      ...(participantIds || [])
    ]);

    const parts = Array.from(mergedPartsSet).filter(Boolean);

    await setDoc(chatRef, {
      participants: parts.length > 0 ? parts : [senderId],
      last_message: encryptedContent,
      last_message_time: now,
      updated_at: now,
      last_read_at: {
        [senderId]: now
      }
    }, { merge: true });

    playSound('outgoing');
    return docRef.id;
  }

  /**
   * 8. Toggle Message Reaction in Firestore
   */
  async toggleMessageReaction(
    chatId: string,
    messageId: string,
    currentUid: string,
    emoji: string
  ): Promise<void> {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      const msgSnap = await getDoc(msgRef);
      if (!msgSnap.exists()) return;

      const data = msgSnap.data();
      let reactions: MessageReaction[] = Array.isArray(data.reactions) ? [...data.reactions] : [];

      const existingIndex = reactions.findIndex(
        (r) => r.user_id === currentUid && r.emoji === emoji
      );

      if (existingIndex >= 0) {
        // Toggle off same emoji
        reactions.splice(existingIndex, 1);
      } else {
        // Remove previous reaction by current user
        const prevIndex = reactions.findIndex((r) => r.user_id === currentUid);
        if (prevIndex >= 0) {
          reactions.splice(prevIndex, 1);
        }
        reactions.push({ emoji, user_id: currentUid });
      }

      await updateDoc(msgRef, {
        reactions: reactions
      });
    } catch (err) {
      console.error('Error updating reaction in Firestore:', err);
    }
  }

  /**
   * Create Group Chat Room with Multi-Admin support
   */
  async createGroupChat(
    groupName: string,
    participants: string[],
    adminUids: string[],
    groupIcon?: string
  ): Promise<string> {
    const chatsCol = collection(db, 'chats');
    const newChatRef = await addDoc(chatsCol, {
      group_name: groupName,
      group_icon: groupIcon || null,
      is_group: true,
      participants,
      memberUids: participants,
      adminUids,
      created_by: adminUids[0] || participants[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_message: 'Group created',
      last_message_time: new Date().toISOString()
    });
    return newChatRef.id;
  }

  /**
   * Update Group Settings (Name, Icon)
   */
  async updateGroupSettings(
    chatId: string,
    updates: { group_name?: string; group_icon?: string }
  ): Promise<void> {
    const chatRef = doc(db, 'chats', chatId);
    await setDoc(chatRef, {
      ...updates,
      updated_at: new Date().toISOString()
    }, { merge: true });
  }

  /**
   * Update Group Admin UIDs
   */
  async updateGroupAdmins(chatId: string, adminUids: string[]): Promise<void> {
    const chatRef = doc(db, 'chats', chatId);
    await setDoc(chatRef, {
      adminUids,
      updated_at: new Date().toISOString()
    }, { merge: true });
  }

  /**
   * Update Group Members & Admins
   */
  async updateGroupMembers(
    chatId: string,
    participants: string[],
    adminUids: string[]
  ): Promise<void> {
    const chatRef = doc(db, 'chats', chatId);
    await setDoc(chatRef, {
      participants,
      memberUids: participants,
      adminUids,
      updated_at: new Date().toISOString()
    }, { merge: true });
  }

  /**
   * Mark Unread Incoming Messages in Chat as Read
   */
  async markMessagesAsRead(chatId: string, currentUid: string): Promise<void> {
    try {
      const now = new Date().toISOString();

      // Record user's last read timestamp on the chat room document
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, {
        last_read_at: {
          [currentUid]: now
        }
      }, { merge: true }).catch(() => {});

      const messagesCol = collection(db, 'chats', chatId, 'messages');
      let snapshot;
      try {
        const q = query(
          messagesCol,
          where('status', '!=', 'read')
        );
        snapshot = await getDocs(q);
      } catch (queryErr) {
        // Fallback to reading collection if index is missing
        snapshot = await getDocs(messagesCol);
      }

      const promises: Promise<void>[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const senderId = data.sender_id || data.uid || data.senderId;
        if (senderId && senderId !== currentUid && data.status !== 'read') {
          promises.push(
            updateDoc(doc(db, 'chats', chatId, 'messages', docSnap.id), {
              status: 'read',
              readAt: now
            }).catch((err) => console.warn('Failed to mark message as read:', err))
          );
        }
      });
      await Promise.all(promises);
    } catch (e) {
      console.error('Error marking messages as read:', e);
    }
  }

  /**
   * Soft Delete Message for Everyone
   */
  async softDeleteMessage(chatId: string, messageId: string, currentUid: string): Promise<void> {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', messageId);
      const snap = await getDoc(msgRef);
      if (snap.exists() && snap.data().sender_id === currentUid) {
        await updateDoc(msgRef, {
          isDeleted: true,
          content: 'This message was deleted'
        });
      }
    } catch (e) {
      console.error('Error soft deleting message:', e);
    }
  }

  /**
   * Clear all chat history for a room in Firestore
   */
  async clearChatHistory(chatId: string): Promise<void> {
    try {
      const messagesCol = collection(db, 'chats', chatId, 'messages');
      const snapshot = await getDocs(messagesCol);

      const deletePromises: Promise<void>[] = [];
      snapshot.forEach((docSnap) => {
        deletePromises.push(deleteDoc(doc(db, 'chats', chatId, 'messages', docSnap.id)));
      });
      await Promise.all(deletePromises);

      // Reset last_message in parent chat doc
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, {
        last_message: '',
        last_message_time: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error('Error clearing chat history in Firestore:', err);
    }
  }

  /**
   * Delete or leave a chat room in Firestore
   */
  async deleteFirestoreChat(chatId: string, currentUid: string): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      // When offline, local deletion is already handled by chatEngine
      return;
    }
    try {
      const chatDocRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatDocRef);
      if (chatSnap.exists()) {
        const data = chatSnap.data();
        const participants: string[] = Array.isArray(data.participants) ? data.participants : [];
        const updatedParticipants = participants.filter(uid => uid !== currentUid);
        if (updatedParticipants.length === 0) {
          await deleteDoc(chatDocRef);
        } else {
          await updateDoc(chatDocRef, {
            participants: updatedParticipants,
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (err: any) {
      if (err?.code === 'unavailable' || err?.message?.includes('offline')) {
        return;
      }
      console.warn('Could not sync chat deletion to Firestore:', err?.message || err);
    }
  }

  /**
   * 9. Register & Save FCM Registration Token
   */
  async saveFcmToken(uid: string, token: string): Promise<void> {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        const existingTokens: string[] = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
        if (!existingTokens.includes(token)) {
          await updateDoc(userDocRef, {
            fcmTokens: [...existingTokens, token],
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error('Error saving FCM token:', err);
    }
  }

  /**
   * 10. Sign Out
   */
  async signOut(): Promise<void> {
    if (auth.currentUser) {
      try {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
          is_online: false,
          last_seen: new Date().toISOString()
        });
      } catch {
        // Continue logout
      }
    }
    await firebaseSignOut(auth);
  }
}

export const firebaseAuthService = new FirebaseAuthService();
