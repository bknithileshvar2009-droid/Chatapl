import { Profile, Room, RoomParticipant, Message, MessageType, TypingStatus } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { io, Socket } from 'socket.io-client';
import { playSound } from '../utils/sound';
import { encryptMessage, decryptMessage, getRoomChannelKey } from '../utils/crypto';
import { apiClientFetch, ApiError, getApiConfig } from '../config/apiClient';
import { firebaseAuthService } from './firebaseAuthService';
import { safeStorage } from '../utils/safeStorage';

const STORAGE_KEYS = {
  CURRENT_USER: 'whatsapp_current_user_prod',
  PROFILES: 'whatsapp_profiles_prod',
  ROOMS: 'whatsapp_rooms_prod',
  PARTICIPANTS: 'whatsapp_participants_prod',
  MESSAGES: 'whatsapp_messages_prod',
  SUPABASE_CONFIG: 'whatsapp_supabase_config_prod',
};

// Clean Production Seed Data
const DEFAULT_PROFILES: Profile[] = [];
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
  private socket: Socket | null = null;

  constructor() {
    this.initStorage();
    this.initBroadcastChannel();
    this.initSupabaseIfAvailable();
    this.initSocket();
  }

  private initSocket() {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      if (!origin) return;

      this.socket = io(origin, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log('[Socket.io] Connected to chat backend:', this.socket?.id);
        const current = this.getCurrentUser();
        if (current) {
          this.socket?.emit('register_user', current);
        }
        this.socket?.emit('sync_request');
      });

      this.socket.on('sync_all', (data: { rooms: Room[]; messages: Message[]; profiles: Profile[]; participants: RoomParticipant[] }) => {
        if (data) {
          this.handleSyncAll(data);
        }
      });

      this.socket.on('receive_message', (msg: Message) => {
        if (msg) {
          this.handleReceiveSocketMessage(msg);
        }
      });

      this.socket.on('user_typing', (data: TypingStatus) => {
        if (data) {
          this.handleTypingState(data);
          this.listeners.typing.forEach(fn => fn(data));
        }
      });

      this.socket.on('room_created', (data: { room: Room; participants: RoomParticipant[] }) => {
        if (data && data.room) {
          this.handleRoomCreated(data.room, data.participants || []);
        }
      });

      this.socket.on('message_updated', (updatedMsg: Message) => {
        if (updatedMsg) {
          this.handleMessageUpdated(updatedMsg);
        }
      });

      this.socket.on('profile_updated', (prof: Profile) => {
        if (prof) {
          this.handleProfileUpdated(prof);
        }
      });

      this.socket.on('user_presence', (data: { userId: string; isOnline: boolean }) => {
        if (data?.userId) {
          const profiles = this.getAllProfiles();
          const idx = profiles.findIndex(p => p.id === data.userId);
          if (idx >= 0) {
            profiles[idx].is_online = data.isOnline;
            profiles[idx].last_seen = new Date().toISOString();
            safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
            this.notifyRoomsListeners();
          }
        }
      });

      this.socket.on('chat_cleared', (data: { roomId: string }) => {
        if (data?.roomId) {
          this.handleChatCleared(data.roomId);
        }
      });

      // Initial REST fallback sync
      this.syncFromRestApi();
    } catch (e) {
      console.warn('[Socket.io] init error:', e);
    }
  }

  private async syncFromRestApi() {
    try {
      const data = await apiClientFetch<{
        rooms: Room[];
        messages: Message[];
        profiles: Profile[];
        participants: RoomParticipant[];
      }>('/api/chat/sync', { method: 'GET', timeoutMs: 5000 });

      if (data && data.rooms) {
        this.handleSyncAll(data);
      }
    } catch (err) {
      console.warn('REST API Sync fallback error:', err);
    }
  }

  private handleSyncAll(data: { rooms: Room[]; messages: Message[]; profiles: Profile[]; participants: RoomParticipant[] }) {
    try {
      const { rooms = [], messages = [], profiles = [], participants = [] } = data;

      // Merge profiles
      const localProfiles = this.getAllProfiles();
      const mergedProfilesMap = new Map<string, Profile>();
      localProfiles.forEach(p => mergedProfilesMap.set(p.id, p));
      profiles.forEach(p => mergedProfilesMap.set(p.id, { ...mergedProfilesMap.get(p.id), ...p }));
      const finalProfiles = Array.from(mergedProfilesMap.values());
      safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(finalProfiles));

      // Merge rooms
      let localRooms: Room[] = [];
      try {
        localRooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
      } catch {}
      const mergedRoomsMap = new Map<string, Room>();
      localRooms.forEach(r => mergedRoomsMap.set(r.id, r));
      rooms.forEach(r => mergedRoomsMap.set(r.id, { ...mergedRoomsMap.get(r.id), ...r }));
      const finalRooms = Array.from(mergedRoomsMap.values());
      safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(finalRooms));

      // Merge participants
      let localParts: RoomParticipant[] = [];
      try {
        localParts = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
      } catch {}
      const mergedPartsMap = new Map<string, RoomParticipant>();
      localParts.forEach(p => mergedPartsMap.set(p.id, p));
      participants.forEach(p => mergedPartsMap.set(p.id, { ...mergedPartsMap.get(p.id), ...p }));
      const finalParts = Array.from(mergedPartsMap.values());
      safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(finalParts));

      // Merge messages
      const localMsgs = this.getRawMessages();
      const mergedMsgsMap = new Map<string, Message>();
      localMsgs.forEach(m => mergedMsgsMap.set(m.id, m));
      messages.forEach(m => mergedMsgsMap.set(m.id, { ...mergedMsgsMap.get(m.id), ...m }));
      const finalMsgs = Array.from(mergedMsgsMap.values());
      safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(finalMsgs));

      this.notifyRoomsListeners();
      this.notifyCurrentUserListeners();
    } catch (e) {
      console.warn('handleSyncAll error:', e);
    }
  }

  private handleReceiveSocketMessage(msg: Message) {
    if (!msg || !msg.id || !msg.room_id) return;
    const localMsgs = this.getRawMessages();
    const existingIdx = localMsgs.findIndex(m => m.id === msg.id);

    if (existingIdx >= 0) {
      localMsgs[existingIdx] = { ...localMsgs[existingIdx], ...msg };
    } else {
      localMsgs.push(msg);
      const currentUser = this.getCurrentUser();
      if (currentUser && msg.sender_id !== currentUser.id) {
        playSound('incoming');
      }
    }
    safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(localMsgs));

    // Update Room last message
    let rooms: Room[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
    } catch {}
    const roomIdx = rooms.findIndex(r => r.id === msg.room_id);
    if (roomIdx >= 0) {
      rooms[roomIdx].last_message_text = msg.type === 'audio' ? '🎤 Voice message' : (msg.type === 'image' ? '📷 Photo' : msg.content);
      rooms[roomIdx].last_message_time = msg.created_at;
      rooms[roomIdx].updated_at = msg.created_at;
      safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    }

    this.notifyMessagesListeners(msg.room_id);
    this.notifyRoomsListeners();
  }

  private handleRoomCreated(room: Room, participants: RoomParticipant[]) {
    let rooms: Room[] = [];
    let parts: RoomParticipant[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
      parts = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    } catch {}

    if (!rooms.some(r => r.id === room.id)) {
      rooms.unshift(room);
      safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    }

    if (participants && Array.isArray(participants)) {
      participants.forEach(p => {
        if (!parts.some(sp => sp.id === p.id)) {
          parts.push(p);
        }
      });
      safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(parts));
    }

    this.notifyRoomsListeners();
  }

  private handleMessageUpdated(updatedMsg: Message) {
    const msgs = this.getRawMessages();
    const idx = msgs.findIndex(m => m.id === updatedMsg.id);
    if (idx >= 0) {
      msgs[idx] = { ...msgs[idx], ...updatedMsg };
      safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
      this.notifyMessagesListeners(updatedMsg.room_id);
    }
  }

  private handleProfileUpdated(prof: Profile) {
    const profiles = this.getAllProfiles();
    const idx = profiles.findIndex(p => p.id === prof.id);
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...prof };
    } else {
      profiles.push(prof);
    }
    safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    this.notifyRoomsListeners();
    this.notifyCurrentUserListeners();
  }

  private handleChatCleared(roomId: string) {
    const msgs = this.getRawMessages().filter(m => m.room_id !== roomId);
    safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
    this.notifyMessagesListeners(roomId);
    this.notifyRoomsListeners();
  }

  private initStorage() {
    try {
      // Clear old test data keys if present
      ['whatsapp_current_user_v2', 'whatsapp_profiles_v2', 'whatsapp_rooms_v2', 'whatsapp_participants_v2', 'whatsapp_messages_v2', 'whatsapp_current_user_v1', 'whatsapp_profiles_v1'].forEach(k => {
        safeStorage.removeItem(k);
      });

      // Purge kmmbabu & bknithileshvar profiles to start as clean new app
      const existingProfiles: Profile[] = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
      const cleanProfiles = existingProfiles.filter(p => {
        if (!p) return false;
        const str = `${p.id} ${p.username} ${p.display_name} ${p.email}`.toLowerCase();
        return !str.includes('kmmbabu') && !str.includes('bknithileshvar') && !str.includes('nithilesh');
      });
      safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(cleanProfiles));

      const curr = this.getCurrentUser();
      if (curr) {
        const uStr = `${curr.id} ${curr.username} ${curr.display_name} ${curr.email}`.toLowerCase();
        if (uStr.includes('kmmbabu') || uStr.includes('bknithileshvar') || uStr.includes('nithilesh')) {
          safeStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        }
      }

      // Purge room-general / public community channel from existing storage
      const existingRooms: Room[] = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
      const cleanRooms = existingRooms.filter(r => r && r.id !== 'room-general' && !r.name?.includes('Public Community'));
      safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(cleanRooms));

      const existingParts: RoomParticipant[] = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
      const cleanParts = existingParts.filter(p => p && p.room_id !== 'room-general');
      safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(cleanParts));

      const existingMsgs: Message[] = JSON.parse(safeStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]');
      const cleanMsgs = existingMsgs.filter(m => m && m.room_id !== 'room-general');
      safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(cleanMsgs));
    } catch (e) {
      console.warn('initStorage warning:', e);
    }
  }

  private initBroadcastChannel() {
    try {
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
    } catch (e) {
      console.warn('BroadcastChannel initialization failed:', e);
    }
  }

  private initSupabaseIfAvailable() {
    const configStr = safeStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG);
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
    const configStr = safeStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG);
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
      safeStorage.removeItem(STORAGE_KEYS.SUPABASE_CONFIG);
      this.supabaseClient = null;
    } else {
      safeStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify({ url, anonKey }));
      this.supabaseClient = createClient(url, anonKey);
    }
  }

  // Current User Operations
  public getCurrentUser(): Profile | null {
    const data = safeStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    try {
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  public getAllProfiles(): Profile[] {
    const data = safeStorage.getItem(STORAGE_KEYS.PROFILES);
    try {
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public getProfileById(id: string): Profile | null {
    if (!id) return null;
    const profiles = this.getAllProfiles();
    return profiles.find(p => p.id === id) || null;
  }

  public saveProfile(profile: Profile): void {
    if (!profile || !profile.id) return;
    const profiles = this.getAllProfiles();
    const idx = profiles.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...profile };
    } else {
      profiles.push(profile);
    }
    safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    this.notifyRoomsListeners();
  }

  public setCurrentUser(profile: Profile) {
    safeStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(profile));
    // Update in profiles array
    const profiles = this.getAllProfiles();
    const idx = profiles.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));

    // Emit real-time registration via Socket.io & REST
    this.socket?.emit('register_user', profile);
    this.socket?.emit('sync_request');
    apiClientFetch('/api/chat/profiles', { method: 'POST', body: JSON.stringify(profile) }).catch(() => {});

    // Sync user profile to Firestore in real-time
    firebaseAuthService.syncUserProfile(profile).catch((err) => {
      console.warn('Sync profile on setCurrentUser warning:', err);
    });

    this.broadcastChannel?.postMessage({ type: 'USER_UPDATED', payload: profile });
    this.notifyCurrentUserListeners();
    this.notifyRoomsListeners();

    // Broadcast messages update for active rooms to refresh UI state after auth
    const rooms = this.getRooms();
    rooms.forEach(r => this.notifyMessagesListeners(r.id));
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
      safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
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
      safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
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
        bio: 'Hey there! I am using Nex Chat.',
        avatar_url: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250`,
        is_private: false,
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      profiles.push(found);
      safeStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    }

    this.setCurrentUser(found);
    return found;
  }

  public logout() {
    safeStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
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

  public ensurePublicRooms(): Room | null {
    // Public group removed as requested
    return null;
  }

  // Room Operations
  public getRooms(): Room[] {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return [];

    let rooms: Room[] = [];
    let participants: RoomParticipant[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
      participants = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    } catch {
      rooms = [];
      participants = [];
    }

    // Filter out any legacy public group rooms
    rooms = rooms.filter(r => r && r.id !== 'room-general' && !r.name?.includes('Public Community'));

    const profiles = this.getAllProfiles();
    const messages = this.getRawMessages();

    // Find rooms where currentUser is participant
    const myParticipantRoomIds = new Set(
      participants.filter(p => p.user_id === currentUser.id).map(p => p.room_id)
    );

    // Deduplicate rooms by ID
    const uniqueRoomsMap = new Map<string, Room>();
    rooms.forEach(r => {
      if (r && r.id && myParticipantRoomIds.has(r.id)) {
        if (!uniqueRoomsMap.has(r.id)) {
          uniqueRoomsMap.set(r.id, r);
        }
      }
    });
    const userRooms = Array.from(uniqueRoomsMap.values());

    return userRooms.map(room => {
      const roomParts = participants.filter(p => p.room_id === room.id);
      let participantProfiles = roomParts
        .map(p => profiles.find(prof => prof.id === p.user_id))
        .filter((prof): prof is Profile => !!prof);

      // Fallback: if local participant profiles array is empty, retain room attached participant_profiles
      if (participantProfiles.length === 0 && room.participant_profiles && room.participant_profiles.length > 0) {
        participantProfiles = room.participant_profiles;
      }

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

  public getOrCreatePrivateRoom(targetUserId: string, customRoomId?: string): Room {
    const currentUser = this.getCurrentUser();
    if (!currentUser) throw new Error("Authentication required");

    const canonicalDirectId = [currentUser.id, targetUserId].sort().join('_direct_');
    const effectiveRoomId = customRoomId || canonicalDirectId;

    let rooms: Room[] = [];
    let participants: RoomParticipant[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
      participants = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    } catch {
      rooms = [];
      participants = [];
    }

    // Check if 1-on-1 room already exists between currentUser and targetUserId
    const myRoomIds = participants.filter(p => p.user_id === currentUser.id).map(p => p.room_id);
    
    for (const roomId of myRoomIds) {
      const room = rooms.find(r => r.id === roomId && !r.is_group);
      if (room) {
        const roomParts = participants.filter(p => p.room_id === roomId);
        const hasTarget = roomParts.some(p => p.user_id === targetUserId);
        if (hasTarget && roomParts.length === 2) {
          if (room.id !== effectiveRoomId) {
            const oldId = room.id;
            room.id = effectiveRoomId;
            participants.filter(p => p.room_id === oldId).forEach(p => p.room_id = effectiveRoomId);
            
            let msgs: Message[] = [];
            try {
              msgs = JSON.parse(safeStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]');
              msgs.forEach(m => {
                if (m.room_id === oldId) m.room_id = effectiveRoomId;
              });
              safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(msgs));
            } catch {}

            safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
            safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
          }
          const profiles = this.getAllProfiles();
          const myProf = profiles.find(p => p.id === currentUser.id) || currentUser;
          const targetProf: Profile = profiles.find(p => p.id === targetUserId) || {
            id: targetUserId,
            display_name: 'User',
            avatar_url: '',
            username: 'user',
            bio: '',
            is_private: false,
            is_online: false,
            last_seen: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          return {
            ...room,
            participant_profiles: [myProf, targetProf]
          };
        }
      }
    }

    // Create a new room with effectiveRoomId
    const newRoomId = effectiveRoomId;
    const newRoom: Room = {
      id: newRoomId,
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

    safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));

    // Emit real-time room creation
    this.socket?.emit('create_room', { room: newRoom, participants: [p1, p2] });
    apiClientFetch('/api/chat/rooms', { method: 'POST', body: JSON.stringify({ room: newRoom, participants: [p1, p2] }) }).catch(() => {});

    this.broadcastChannel?.postMessage({ type: 'ROOM_UPDATED', payload: newRoom });
    this.notifyRoomsListeners();

    const profiles = this.getAllProfiles();
    const myProf = profiles.find(p => p.id === currentUser.id) || currentUser;
    const targetProf: Profile = profiles.find(p => p.id === targetUserId) || {
      id: targetUserId,
      display_name: 'User',
      avatar_url: '',
      username: 'user',
      bio: '',
      is_private: false,
      is_online: false,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return {
      ...newRoom,
      participant_profiles: [myProf, targetProf]
    };
  }

  public saveRoom(room: Room): void {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return;

    let rooms: Room[] = [];
    let participants: RoomParticipant[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
      participants = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    } catch {
      rooms = [];
      participants = [];
    }

    // Remove any duplicate room entries with same ID
    const uniqueRoomsMap = new Map<string, Room>();
    rooms.forEach(r => {
      if (r && r.id) {
        uniqueRoomsMap.set(r.id, r);
      }
    });
    uniqueRoomsMap.set(room.id, { ...(uniqueRoomsMap.get(room.id) || {}), ...room });
    rooms = Array.from(uniqueRoomsMap.values());

    if (!participants.some(p => p.room_id === room.id && p.user_id === currentUser.id)) {
      participants.push({
        id: `p-${room.id}-${currentUser.id}`,
        room_id: room.id,
        user_id: currentUser.id,
        role: 'admin',
        joined_at: new Date().toISOString(),
        last_read_at: new Date().toISOString()
      });
    }

    if (room.participant_profiles) {
      room.participant_profiles.forEach(pProfile => {
        if (pProfile && pProfile.id) {
          if (!participants.some(p => p.room_id === room.id && p.user_id === pProfile.id)) {
            participants.push({
              id: `p-${room.id}-${pProfile.id}`,
              room_id: room.id,
              user_id: pProfile.id,
              role: 'member',
              joined_at: new Date().toISOString(),
              last_read_at: new Date().toISOString()
            });
          }
          this.saveProfile(pProfile);
        }
      });
    }

    safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
    this.notifyRoomsListeners();
  }

  public saveMessages(roomId: string, incomingMessages: Message[]): void {
    const allMsgs = this.getRawMessages();
    const otherRoomMsgs = allMsgs.filter(m => m.room_id !== roomId);

    if (!incomingMessages || incomingMessages.length === 0) {
      const existingRoomMsgs = allMsgs.filter(m => m.room_id === roomId);
      const pendingMsgs = existingRoomMsgs.filter(m =>
        m.is_queued_offline || m.status === 'queued' || m.id.startsWith('msg_offline_') || m.id.startsWith('msg-')
      );
      safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify([...otherRoomMsgs, ...pendingMsgs]));
      this.notifyMessagesListeners(roomId);
      return;
    }

    const secretKey = getRoomChannelKey(roomId);
    const roomMsgsMap = new Map<string, Message>();
    const existingRoomMsgs = allMsgs.filter(m => m.room_id === roomId);
    existingRoomMsgs.forEach(m => roomMsgsMap.set(m.id, m));

    incomingMessages.forEach(m => {
      // Remove temporary local message if Firestore message has arrived
      const tempMatch = existingRoomMsgs.find(ex => {
        if (!ex.id.startsWith('msg-') && !ex.id.startsWith('msg_offline_')) return false;
        if (ex.sender_id !== m.sender_id) return false;

        const exText = (ex.type === 'text' || !ex.type) ? decryptMessage(ex.content, secretKey) : ex.content;
        const mText = (m.type === 'text' || !m.type) ? decryptMessage(m.content, secretKey) : m.content;

        const isContentMatch = exText === mText || ex.content === m.content || (exText && mText && exText.trim() === mText.trim());
        const isTimeMatch = Math.abs(new Date(ex.created_at).getTime() - new Date(m.created_at).getTime()) < 10000;

        return isContentMatch && isTimeMatch;
      });

      if (tempMatch) {
        roomMsgsMap.delete(tempMatch.id);
      }
      roomMsgsMap.set(m.id, m);
    });

    const updatedRoomMsgs = Array.from(roomMsgsMap.values());
    const finalAllMsgs = [...otherRoomMsgs, ...updatedRoomMsgs];
    safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(finalAllMsgs));
    this.notifyMessagesListeners(roomId);
  }

  public deleteRoom(roomId: string): void {
    const currentUser = this.getCurrentUser();
    let rooms: Room[] = [];
    let participants: RoomParticipant[] = [];
    let messages: Message[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
      participants = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
      messages = JSON.parse(safeStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]');
    } catch {}

    const filteredRooms = rooms.filter(r => r.id !== roomId);
    const filteredParticipants = participants.filter(p => p.room_id !== roomId);
    const filteredMessages = messages.filter(m => m.room_id !== roomId);

    safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(filteredRooms));
    safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(filteredParticipants));
    safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(filteredMessages));

    if (currentUser) {
      firebaseAuthService.deleteFirestoreChat(roomId, currentUser.id).catch(() => {});
    }

    this.broadcastChannel?.postMessage({ type: 'ROOM_DELETED', payload: { roomId } });
    this.notifyRoomsListeners();
  }

  // Messages Operations
  private getRawMessages(): Message[] {
    try {
      return JSON.parse(safeStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]');
    } catch {
      return [];
    }
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
    audioDuration?: number,
    senderIdOverride?: string
  ): Message {
    const currentUser = this.getCurrentUser();
    const effectiveSenderId = senderIdOverride || currentUser?.id;
    if (!effectiveSenderId) throw new Error("Must be logged in to send message");

    const secretKey = getRoomChannelKey(roomId);
    const encryptedContent = (type === 'text' || !type) ? encryptMessage(content, secretKey) : content;

    const messages = this.getRawMessages();
    const newMessage: Message = {
      id: 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      room_id: roomId,
      sender_id: effectiveSenderId,
      content: encryptedContent,
      type,
      attachment_url: attachmentUrl,
      audio_duration: audioDuration,
      reply_to_id: replyToId,
      status: 'sent',
      created_at: new Date().toISOString(),
    };

    messages.push(newMessage);
    safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));

    // Update Room last message
    let rooms: Room[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
    } catch {
      rooms = [];
    }
    const roomIdx = rooms.findIndex(r => r.id === roomId);
    if (roomIdx >= 0) {
      rooms[roomIdx].last_message_text = type === 'audio' ? '🎤 Voice message' : (type === 'image' ? '📷 Photo' : (encryptedContent || content));
      rooms[roomIdx].last_message_time = newMessage.created_at;
      rooms[roomIdx].updated_at = newMessage.created_at;
      safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    }

    // Update sender's last_read_at timestamp in participants
    let participants: RoomParticipant[] = [];
    try {
      participants = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    } catch {
      participants = [];
    }
    const partIdx = participants.findIndex(p => p.room_id === roomId && p.user_id === effectiveSenderId);
    if (partIdx >= 0) {
      participants[partIdx].last_read_at = newMessage.created_at;
      safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
    }

    // Play sound based on sender
    if (currentUser && effectiveSenderId === currentUser.id) {
      playSound('outgoing');
    } else {
      playSound('incoming');
    }

    // Emit live message via Socket.io and REST backup
    this.socket?.emit('send_message', newMessage);
    apiClientFetch('/api/chat/messages', { method: 'POST', body: JSON.stringify(newMessage) }).catch(() => {});

    // Broadcast update
    this.broadcastChannel?.postMessage({ type: 'MESSAGE_ADDED', payload: newMessage });
    this.notifyMessagesListeners(roomId);
    this.notifyRoomsListeners();

    return newMessage;
  }

  public async triggerAiBotReply(_roomId: string, _userMessageText: string): Promise<void> {
    // AI Assistant Bot auto-reply disabled as requested
    return;
  }

  public clearChatHistory(roomId: string): void {
    const messages = this.getRawMessages();
    const filteredMessages = messages.filter(m => m.room_id !== roomId);
    safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(filteredMessages));

    // Reset Room last message
    let rooms: Room[] = [];
    try {
      rooms = JSON.parse(safeStorage.getItem(STORAGE_KEYS.ROOMS) || '[]');
    } catch {
      rooms = [];
    }
    const roomIdx = rooms.findIndex(r => r.id === roomId);
    if (roomIdx >= 0) {
      rooms[roomIdx].last_message_text = '';
      rooms[roomIdx].last_message_time = new Date().toISOString();
      rooms[roomIdx].updated_at = new Date().toISOString();
      safeStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
    }

    this.socket?.emit('clear_chat', { roomId });
    this.broadcastChannel?.postMessage({ type: 'MESSAGE_ADDED', payload: { room_id: roomId } });
    this.notifyMessagesListeners(roomId);
    this.notifyRoomsListeners();
  }

  public markRoomAsRead(roomId: string) {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return;

    let participants: RoomParticipant[] = [];
    try {
      participants = JSON.parse(safeStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || '[]');
    } catch {
      participants = [];
    }
    const partIdx = participants.findIndex(p => p.room_id === roomId && p.user_id === currentUser.id);

    if (partIdx >= 0) {
      participants[partIdx].last_read_at = new Date().toISOString();
      safeStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
      
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
        safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
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
    safeStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));

    this.socket?.emit('add_reaction', { messageId, roomId: msg.room_id, emoji, userId: currentUser.id });
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

    const status: TypingStatus = {
      userId,
      roomId,
      isTyping,
      displayName: currentUser?.display_name || 'Member',
      username: currentUser?.username || ''
    };
    this.handleTypingState(status);
    this.socket?.emit('typing', status);
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
