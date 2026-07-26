import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  updateProfile as updateFirebaseProfile,
  signInWithPopup,
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
  deleteDoc
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../config/firebase';
import { Profile, Room, Message, MessageReaction } from '../types';
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
    const cleanUsername = usernameInput.trim().toLowerCase().replace(/^@/, '');
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
      created_at: new Date().toISOString()
    });

    // Step 4: Write User Profile document in Firestore 'users' collection
    const newProfile: Profile = {
      id: uid,
      username: cleanUsername,
      display_name: finalDisplayName,
      bio: 'Hey there! I am using Nexus WhatsApp.',
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
      uid
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
   * 3. Google / Gmail Sign In
   */
  async loginWithGoogle(): Promise<Profile> {
    const userCredential = await signInWithPopup(auth, googleProvider);
    const user = userCredential.user;
    const uid = user.uid;
    const email = user.email || `${uid}@gmail.com`;
    const cleanUsername = email.split('@')[0].toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');

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
        bio: 'Gmail Protected Account',
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
      await setDoc(userDocRef, { ...profile, uid });
    }

    return profile;
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
   * 5. User Search by @username (filtered by isSearchable == true)
   */
  async searchUsers(searchQuery: string = '', currentUid: string = ''): Promise<Profile[]> {
    const clean = searchQuery.trim().toLowerCase().replace(/^@/, '');

    const usersCol = collection(db, 'users');
    const q = query(
      usersCol,
      where('isSearchable', '==', true)
    );

    const snapshot = await getDocs(q);
    const results: Profile[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Profile;
      if (data.id !== currentUid) {
        if (!clean || data.username.toLowerCase().includes(clean) || data.display_name.toLowerCase().includes(clean)) {
          results.push({ ...data, id: docSnap.id });
        }
      }
    });

    return results;
  }

  /**
   * 6. Direct Messaging & Chat Room creation
   */
  async getOrCreateDirectChat(currentUid: string, targetUid: string): Promise<string> {
    const chatsCol = collection(db, 'chats');
    const q = query(chatsCol, where('participants', 'array-contains', currentUid));
    const snapshot = await getDocs(q);

    let existingChatId: string | null = null;
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.is_group && Array.isArray(data.participants) && data.participants.includes(targetUid)) {
        existingChatId = docSnap.id;
      }
    });

    if (existingChatId) {
      return existingChatId;
    }

    // Create new Chat Room
    const newChatRef = await addDoc(chatsCol, {
      participants: [currentUid, targetUid],
      is_group: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_message: '',
      last_message_time: new Date().toISOString()
    });

    return newChatRef.id;
  }

  /**
   * Real-time User Chats Subscription
   */
  subscribeToUserChats(
    currentUid: string,
    onRoomsChange: (rooms: Room[]) => void
  ): () => void {
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
        } catch (e) {
          console.error('Error calculating unread count in subscribeToUserChats:', e);
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
    }, (err) => {
      console.error('Error in subscribeToUserChats:', err);
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
    const messagesCol = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesCol, orderBy('created_at', 'asc'));
    const channelKey = getRoomChannelKey(chatId);

    let isInitialLoad = true;

    return onSnapshot(q, (snapshot) => {
      const messages: Message[] = [];

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !isInitialLoad) {
          const data = change.doc.data();
          const senderId = data.sender_id || data.uid || data.senderId;
          if (senderId && senderId !== currentUid) {
            playSound('incoming');
          }
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

      isInitialLoad = false;
      onMessagesChange(messages);
    }, (error) => {
      console.error('Error in chat messages snapshot:', error);
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
    audioDuration?: number
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

    // Update parent chat doc (use setDoc with merge: true in case document was created locally or doesn't exist yet)
    const chatRef = doc(db, 'chats', chatId);
    await setDoc(chatRef, {
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
      const q = query(
        messagesCol,
        where('status', '!=', 'read')
      );
      const snapshot = await getDocs(q);

      const promises: Promise<void>[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.sender_id !== currentUid) {
          promises.push(
            updateDoc(doc(db, 'chats', chatId, 'messages', docSnap.id), {
              status: 'read',
              readAt: now
            }).catch((err) => console.error('Failed to mark message as read:', err))
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
