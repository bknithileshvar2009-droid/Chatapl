import { Profile, Room, RoomParticipant, Message, MessageType, TypingStatus } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { playSound } from '../utils/sound';
import { encryptMessage, decryptMessage, getRoomChannelKey } from '../utils/crypto';

const STORAGE_KEYS = {
  CURRENT_USER: 'whatsapp_current_user_prod',
  PROFILES: 'whatsapp_profiles_prod',
  ROOMS: 'whatsapp_rooms_prod',
  PARTICIPANTS: 'whatsapp_participants_prod',
  MESSAGES: 'whatsapp_messages_prod',
  SUPABASE_CONFIG: 'whatsapp_supabase_config_prod',
};

export const AI_ASSISTANT_PROFILE: Profile = {
  id: 'usr-google-ai-studio',
  username: 'aistudio',
  display_name: 'Google AI Studio Assistant',
  bio: '⚡ Powered by Gemini 3.6 Flash. Smart replies, translations, summaries & creative AI content.',
  avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=GoogleAIStudio',
  is_private: false,
  is_online: true,
  last_seen: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Clean Production Seed Data with Embedded AI Assistant
const DEFAULT_PROFILES: Profile[] = [AI_ASSISTANT_PROFILE];
const DEFAULT_ROOMS: Room[] = [];
const DEFAULT_PARTICIPANTS: RoomParticipant[] = [];
const DEFAULT_MESSAGES: Message[] = [];

type Listener<T> = (data: T) => void;

class ChatEngineService {
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: {
    messages: Set<Listener<Message[]>>;
    rooms: Set<Listener<Room[]>>;
    typing: Set<Listener<TypingStatus>>;
    currentUser: Set<Listener<Profile | null>>;
  } = {
    messages: new Set(),
    rooms: new Set(),
    typing: new Set(),
    currentUser: new Set(),
  };

  private activeTypingMap: Map<string, Map<string, NodeJS.Timeout>> = new Map();

  private supabaseClient: SupabaseClient | null = null;

  constructor() {
    this.initStorage();
    this.initBroadcastChannel();
    this.initSupabaseIfAvailable();
  }

  private initStorage() {
    // Clear old test data keys if present
    ['whatsapp_current_user_v2', 'whatsapp_profiles_v2', 'whatsapp_rooms_v2', 'whatsapp_participants_v2', 'whatsapp_messages_v2', 'whatsapp_current_user_v1', 'whatsapp_profiles_v1'].forEach(k => {
      localStorage.removeItem(k);
    });

    const existingProfiles: Profile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
    if (!existingProfiles.some(p => p.id === AI_ASSISTANT_PROFILE.id)) {
      existingProfiles.push(AI_ASSISTANT_PROFILE);
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(existingProfiles));
    }
    if (!localStorage.getItem(STORAGE_KEYS.ROOMS)) {
      localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(DEFAULT_ROOMS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.PARTICIPANTS)) {
      localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(DEFAULT_PARTICIPANTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(DEFAULT_MESSAGES));
    }
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('whatsapp_realtime_v1');
      this.broadcastChannel.onmessage = (event) => {
        const { type, payload } = event.data;
        if (type === 'MESSAGE_ADDED' || type === 'ROOM_UPDATED') {
          if (type === 'MESSAGE_ADDED' && payload?.sender_id !== this.getCurrentUser()?.id) {
            playSound('incoming');
          }
          this.notifyRoomsListeners();
          this.notifyMessagesListeners(payload?.room_id);
        } else if (type === 'TYPING') {
          if (payload) {
            this.handleTypingState(payload);
          }
          this.listeners.typing.forEach(fn => fn(payload));
        } else if (type === 'USER_UPDATED') {
          this.notifyCurrentUserListeners();
          this.notifyRoomsListeners();
        }
      };
    }
  }

  private initSupabaseIfAvailable() {
    const configStr = localStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG);
    if (configStr) {
      try {
        const { url, anonKey } = JSON.parse(configStr);
        if (url && anonKey) {
          this.supabaseClient = createClient(url, anonKey);
        }
      } catch (err) {
        console.error('Failed to init Supabase client from storage:', err);
      }
    }
  }

  public getSupabaseConfig(): { url: string; anonKey: string } | null {
    const configStr = localStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG);
    if (configStr) {
      try {
        return JSON.parse(configStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  public saveSupabaseConfig(url: string, anonKey: string) {
    if (!url || !anonKey) {
      localStorage.removeItem(STORAGE_KEYS.SUPABASE_CONFIG);
      this.supabaseClient = null;
    } else {
      localStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify({ url, anonKey }));
      this.supabaseClient = createClient(url, anonKey);
    }
  }

  // Current User Operations
  public getCurrentUser(): Profile | null {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    return data ? JSON.parse(data) : null;
  }

  public getAllProfiles(): Profile[] {
    const data = localStorage.getItem(STORAGE_KEYS.PROFILES);
    return data ? JSON.parse(data) : [];
  }

  public setCurrentUser(profile: Profile) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(profile));
    // Update in profiles array
    const profiles = this.getAllProfiles();
    const idx = profiles.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));

    this.broadcastChannel?.postMessage({ type: 'USER_UPDATED', payload: profile });
    this.notifyCurrentUserListeners();
    this.notifyRoomsListeners();
  }

  public updateProfile(updates: Partial<Profile>): Profile {
    const current = this.getCurrentUser();
    if (!current) throw new Error("No user logged in");

    const updated: Profile = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.setCurrentUser(updated);
    return updated;
  }

  public loginWithGoogle(email: string, displayName?: string, avatarUrl?: string): Profile {
    const profiles = this.getAllProfiles();
    const cleanEmail = email.trim().toLowerCase();
    const defaultUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');

    let found = profiles.find(
      p => (p.email && p.email.toLowerCase() === cleanEmail) || p.username.toLowerCase() === defaultUsername
    );

    const googleAvatar = avatarUrl || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250`;

    if (!found) {
      found = {
        id: 'user-google-' + Date.now(),
        username: defaultUsername,
        display_name: displayName || cleanEmail.split('@')[0] || 'Google User',
        bio: 'Verified Gmail Protected Profile',
        avatar_url: googleAvatar,
        is_private: false,
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email: cleanEmail,
        is_google_protected: true,
      };
      profiles.push(found);
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    } else {
      found = {
        ...found,
        email: cleanEmail,
        is_google_protected: true,
        avatar_url: found.avatar_url || googleAvatar,
        is_online: true,
        updated_at: new Date().toISOString(),
      };
      const idx = profiles.findIndex(p => p.id === found!.id);
      if (idx >= 0) profiles[idx] = found;
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    }

    this.setCurrentUser(found);
    return found;
  }

  public login(emailOrUsername: string): Profile {
    const profiles = this.getAllProfiles();
    const cleanQuery = emailOrUsername.trim().toLowerCase().replace(/^@/, '');

    let found = profiles.find(
      p => p.username.toLowerCase() === cleanQuery || p.display_name.toLowerCase() === cleanQuery
    );

    if (!found) {
      // Auto register if not found
      found = {
        id: 'user-' + Date.now(),
        username: cleanQuery || 'user_' + Math.floor(Math.random() * 1000),
        display_name: emailOrUsername.split('@')[0] || 'Chat Member',
        bio: 'Hey there! I am using WhatsApp Chat.',
        avatar_url: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250`,
        is_private: false,
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      profiles.push(found);
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    }

    this.setCurrentUser(found);
    return found;
  }

  public logout() {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    this.notifyCurrentUserListeners();
  }

  // Search & User Discovery
  public searchUsers(query: string): Profile[] {
    const currentUser = this.getCurrentUser();
    const profiles = this.getAllProfiles();
    const clean = query.trim().toLowerCase();

    if (!clean) return [];

    const isExactUsernameSearch = clean.startsWith('@');
    const searchTerm = isExactUsernameSearch ? clean.substring(1) : clean;

    return profiles.filter(p => {
      if (currentUser && p.id === currentUser.id) return false;

      const usernameMatch = p.username.toLowerCase() === searchTerm;
      const partialUsernameMatch = p.username.toLowerCase().includes(searchTerm);
      const nameMatch = p.display_name.toLowerCase().includes(searchTerm);

      // Private Account Rule:
      // If account is private, it ONLY shows up if search matches exact @username OR exact username term!
      if (p.is_private) {
        return usernameMatch;
      }

      return partialUsernameMatch || nameMatch;
    });
  }

  // Room Operations
  public getRooms(): Room[] {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return [];

    const rooms: Room[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
    const participants: RoomParticipant[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    const profiles = this.getAllProfiles();
    const messages = this.getRawMessages();

    // Find rooms where currentUser is participant
    const myParticipantRoomIds = new Set(
      participants.filter(p => p.user_id === currentUser.id).map(p => p.room_id)
    );

    const userRooms = rooms.filter(r => myParticipantRoomIds.has(r.id));

    return userRooms.map(room => {
      const roomParts = participants.filter(p => p.room_id === room.id);
      const participantProfiles = roomParts
        .map(p => profiles.find(prof => prof.id === p.user_id))
        .filter((prof): prof is Profile => !!prof);

      // Calculate unread count
      const myPart = roomParts.find(p => p.user_id === currentUser.id);
      const lastReadTime = myPart?.last_read_at ? new Date(myPart.last_read_at).getTime() : 0;
      
      const unreadCount = messages.filter(
        m => m.room_id === room.id && 
             m.sender_id !== currentUser.id && 
             new Date(m.created_at).getTime() > lastReadTime
      ).length;

      const secretKey = getRoomChannelKey(room.id);
      const decryptedLastMsg = room.last_message_text ? decryptMessage(room.last_message_text, secretKey) : '';

      return {
        ...room,
        last_message_text: decryptedLastMsg,
        participant_profiles: participantProfiles,
        unread_count: unreadCount,
      };
    }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  public getOrCreatePrivateRoom(targetUserId: string): Room {
    const currentUser = this.getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const rooms: Room[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
    const participants: RoomParticipant[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');

    // Check if 1-on-1 room already exists between currentUser and targetUserId
    const myRoomIds = participants.filter(p => p.user_id === currentUser.id).map(p => p.room_id);
    
    for (const roomId of myRoomIds) {
      const room = rooms.find(r => r.id === roomId && !r.is_group);
      if (room) {
        const roomParts = participants.filter(p => p.room_id === roomId);
        const hasTarget = roomParts.some(p => p.user_id === targetUserId);
        if (hasTarget && roomParts.length === 2) {
          return room;
        }
      }
    }

    // Create a new room
    const newRoom: Room = {
      id: 'room-' + Date.now(),
      is_group: false,
      created_by: currentUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_message_text: 'Chat started',
      last_message_time: new Date().toISOString(),
    };

    const p1: RoomParticipant = {
      id: 'p-' + Date.now() + '-1',
      room_id: newRoom.id,
      user_id: currentUser.id,
      role: 'admin',
      joined_at: new Date().toISOString(),
      last_read_at: new Date().toISOString(),
    };

    const p2: RoomParticipant = {
      id: 'p-' + Date.now() + '-2',
      room_id: newRoom.id,
      user_id: targetUserId,
      role: 'member',
      joined_at: new Date().toISOString(),
      last_read_at: new Date().toISOString(),
    };

    rooms.push(newRoom);
    participants.push(p1, p2);

    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));

    this.broadcastChannel?.postMessage({ type: 'ROOM_UPDATED', payload: newRoom });
    this.notifyRoomsListeners();

    return newRoom;
  }

  // Messages Operations
  private getRawMessages(): Message[] {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]');
  }

  public getMessages(roomId: string): Message[] {
    const messages = this.getRawMessages();
    const profiles = this.getAllProfiles();
    const secretKey = getRoomChannelKey(roomId);

    return messages
      .filter(m => m.room_id === roomId)
      .map(m => ({
        ...m,
        content: m.type === 'text' || !m.type ? decryptMessage(m.content, secretKey) : m.content,
        sender_profile: profiles.find(p => p.id === m.sender_id),
      }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  public sendMessage(
    roomId: string, 
    content: string, 
    type: MessageType = 'text', 
    attachmentUrl?: string, 
    replyToId?: string,
    audioDuration?: number
  ): Message {
    const currentUser = this.getCurrentUser();
    if (!currentUser) throw new Error("Must be logged in to send message");

    const secretKey = getRoomChannelKey(roomId);
    const encryptedContent = (type === 'text' || !type) ? encryptMessage(content, secretKey) : content;

    const messages = this.getRawMessages();
    const newMessage: Message = {
      id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      room_id: roomId,
      sender_id: currentUser.id,
      content: encryptedContent,
      type,
      attachment_url: attachmentUrl,
      audio_duration: audioDuration,
      reply_to_id: replyToId,
      status: 'sent',
      created_at: new Date().toISOString(),
    };

    messages.push(newMessage);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));

    // Update Room last message
    const rooms: Room[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
    const roomIdx = rooms.findIndex(r => r.id === roomId);
    if (roomIdx >= 0) {
      rooms[roomIdx].last_message_text = type === 'audio' ? '🎤 Voice message' : (type === 'image' ? '📷 Photo' : (encryptedContent || content));
      rooms[roomIdx].last_message_time = newMessage.created_at;
      rooms[roomIdx].updated_at = newMessage.created_at;
      localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    }

    // Update sender's last_read_at timestamp in participants
    const participants: RoomParticipant[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    const partIdx = participants.findIndex(p => p.room_id === roomId && p.user_id === currentUser.id);
    if (partIdx >= 0) {
      participants[partIdx].last_read_at = newMessage.created_at;
      localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
    }

    // Play outgoing pop sound
    playSound('outgoing');

    // Broadcast update
    this.broadcastChannel?.postMessage({ type: 'MESSAGE_ADDED', payload: newMessage });
    this.notifyMessagesListeners(roomId);
    this.notifyRoomsListeners();

    // Trigger realistic auto-response for demo bot participants if applicable
    this.triggerAutoResponseIfDemo(roomId, content);

    return newMessage;
  }

  private triggerAutoResponseIfDemo(roomId: string, userMessage: string) {
    const participants: RoomParticipant[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    const isAiRoom = participants.some(p => p.room_id === roomId && p.user_id === AI_ASSISTANT_PROFILE.id);

    if (!isAiRoom) return;

    // Post typing status
    this.broadcastChannel?.postMessage({
      type: 'TYPING',
      payload: { room_id: roomId, user_id: AI_ASSISTANT_PROFILE.id, is_typing: true }
    });

    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage })
    })
      .then(res => res.json())
      .then(data => {
        const replyText = data.reply || "I am Google AI Studio Assistant! How can I assist with chat summaries, translations, or quick suggestions today? ✨";

        const secretKey = getRoomChannelKey(roomId);
        const encryptedContent = encryptMessage(replyText, secretKey);

        const messages = this.getRawMessages();
        const aiMessage: Message = {
          id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          room_id: roomId,
          sender_id: AI_ASSISTANT_PROFILE.id,
          content: encryptedContent,
          type: 'text',
          status: 'read',
          created_at: new Date().toISOString(),
        };

        messages.push(aiMessage);
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));

        // Update room metadata
        const rooms: Room[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
        const rIdx = rooms.findIndex(r => r.id === roomId);
        if (rIdx >= 0) {
          rooms[rIdx].last_message_text = replyText;
          rooms[rIdx].last_message_time = aiMessage.created_at;
          rooms[rIdx].updated_at = aiMessage.created_at;
          localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
        }

        playSound('incoming');

        this.broadcastChannel?.postMessage({ type: 'MESSAGE_ADDED', payload: aiMessage });
        this.notifyMessagesListeners(roomId);
        this.notifyRoomsListeners();
      })
      .catch(err => {
        console.warn("Google AI Studio response error:", err);
      });
  }

  public clearChatHistory(roomId: string): void {
    const messages = this.getRawMessages();
    const filteredMessages = messages.filter(m => m.room_id !== roomId);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(filteredMessages));

    // Reset Room last message
    const rooms: Room[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
    const roomIdx = rooms.findIndex(r => r.id === roomId);
    if (roomIdx >= 0) {
      rooms[roomIdx].last_message_text = '';
      rooms[roomIdx].last_message_time = new Date().toISOString();
      rooms[roomIdx].updated_at = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    }

    this.broadcastChannel?.postMessage({ type: 'MESSAGE_ADDED', payload: { room_id: roomId } });
    this.notifyMessagesListeners(roomId);
    this.notifyRoomsListeners();
  }

  public markRoomAsRead(roomId: string) {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return;

    const participants: RoomParticipant[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    const partIdx = participants.findIndex(p => p.room_id === roomId && p.user_id === currentUser.id);

    if (partIdx >= 0) {
      participants[partIdx].last_read_at = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
      
      // Update message read statuses in memory
      const messages = this.getRawMessages();
      let updated = false;
      messages.forEach(m => {
        if (m.room_id === roomId && m.sender_id !== currentUser.id && m.status !== 'read') {
          m.status = 'read';
          updated = true;
        }
      });
      if (updated) {
        localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
      }

      this.notifyRoomsListeners();
    }
  }

  public toggleReaction(messageId: string, emoji: string): Message | null {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return null;

    const messages = this.getRawMessages();
    const msgIdx = messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1) return null;

    const msg = messages[msgIdx];
    const reactions = msg.reactions ? [...msg.reactions] : [];

    const existingIndex = reactions.findIndex(
      r => r.user_id === currentUser.id && r.emoji === emoji
    );

    if (existingIndex >= 0) {
      // User clicked same emoji, remove reaction
      reactions.splice(existingIndex, 1);
    } else {
      // Remove any existing reaction by this user first
      const existingUserReaction = reactions.findIndex(r => r.user_id === currentUser.id);
      if (existingUserReaction >= 0) {
        reactions.splice(existingUserReaction, 1);
      }
      reactions.push({ emoji, user_id: currentUser.id });
    }

    msg.reactions = reactions;
    messages[msgIdx] = msg;
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));

    this.broadcastChannel?.postMessage({ type: 'MESSAGE_ADDED', payload: msg });
    this.notifyMessagesListeners(msg.room_id);
    return msg;
  }

  private handleTypingState(status: TypingStatus) {
    const { roomId, userId, isTyping } = status;
    if (!roomId || !userId) return;

    if (!this.activeTypingMap.has(roomId)) {
      this.activeTypingMap.set(roomId, new Map());
    }
    const roomTyping = this.activeTypingMap.get(roomId)!;

    if (roomTyping.has(userId)) {
      clearTimeout(roomTyping.get(userId));
      roomTyping.delete(userId);
    }

    if (isTyping) {
      const timeout = setTimeout(() => {
        roomTyping.delete(userId);
        const expiredStatus: TypingStatus = { roomId, userId, isTyping: false };
        this.listeners.typing.forEach(fn => fn(expiredStatus));
      }, 3000);
      roomTyping.set(userId, timeout);
    }
  }

  public getTypingUserIds(roomId: string): string[] {
    const roomTyping = this.activeTypingMap.get(roomId);
    if (!roomTyping) return [];
    return Array.from(roomTyping.keys());
  }

  public setTyping(roomId: string, isTyping: boolean, explicitUserId?: string) {
    const currentUser = this.getCurrentUser();
    const userId = explicitUserId || currentUser?.id;
    if (!userId) return;

    const status: TypingStatus = { userId, roomId, isTyping };
    this.handleTypingState(status);
    this.broadcastChannel?.postMessage({ type: 'TYPING', payload: status });
    this.listeners.typing.forEach(fn => fn(status));
  }

  // Subscription Listeners
  public subscribeMessages(listener: Listener<Message[]>): () => void {
    this.listeners.messages.add(listener);
    return () => {
      this.listeners.messages.delete(listener);
    };
  }

  public subscribeRooms(listener: Listener<Room[]>): () => void {
    this.listeners.rooms.add(listener);
    return () => {
      this.listeners.rooms.delete(listener);
    };
  }

  public subscribeTyping(listener: Listener<TypingStatus>): () => void {
    this.listeners.typing.add(listener);
    return () => {
      this.listeners.typing.delete(listener);
    };
  }

  public subscribeCurrentUser(listener: Listener<Profile | null>): () => void {
    this.listeners.currentUser.add(listener);
    return () => {
      this.listeners.currentUser.delete(listener);
    };
  }

  private notifyMessagesListeners(roomId?: string) {
    if (!roomId) return;
    const msgs = this.getMessages(roomId);
    this.listeners.messages.forEach(fn => fn(msgs));
  }

  private notifyRoomsListeners() {
    const rms = this.getRooms();
    this.listeners.rooms.forEach(fn => fn(rms));
  }

  private notifyCurrentUserListeners() {
    const user = this.getCurrentUser();
    this.listeners.currentUser.forEach(fn => fn(user));
  }
}

export const chatEngine = new ChatEngineService();
