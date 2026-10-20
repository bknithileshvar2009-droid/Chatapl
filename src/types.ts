export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  is_private: boolean;
  isSearchable?: boolean;
  is_online: boolean;
  last_seen: string;
  created_at: string;
  updated_at: string;
  email?: string;
  is_google_protected?: boolean;
  is_vip_creator?: boolean;
  subscriber_count?: number;
  total_tips_earned?: number;
}

export type EphemeralTimer = 'off' | '24h' | '7d' | '90d';

export interface Room {
  id: string;
  name?: string;
  is_group: boolean;
  group_icon?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  last_message_text?: string;
  last_message_time?: string;
  unread_count?: number;
  participant_profiles?: Profile[];
  adminUids?: string[];
  memberUids?: string[];
  disappearing_timer?: EphemeralTimer;
  is_e2ee_enabled?: boolean;
  topic?: string;
  avatar_url?: string;
}

export interface RoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  role: 'admin' | 'member';
  last_read_at: string;
}

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'queued';
export type MessageType = 'text' | 'image' | 'audio' | 'system';

export interface MessageReaction {
  emoji: string;
  user_id: string;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  type: MessageType;
  attachment_url?: string;
  audio_duration?: number;
  transcript?: string;
  reply_to_id?: string;
  status: MessageStatus;
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean;
  created_at: string;
  sender_profile?: Profile;
  reactions?: MessageReaction[];
  // E2EE & Ephemeral fields
  is_encrypted?: boolean;
  ciphertext?: string;
  ephemeral_ttl?: number; // expiration in ms or seconds
  expires_at?: string;
  is_queued_offline?: boolean;
}

export interface E2EKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface TypingStatus {
  userId: string;
  roomId: string;
  isTyping: boolean;
  username?: string;
  displayName?: string;
}

export interface CallSession {
  id: string;
  type: 'audio' | 'video';
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar?: string;
  status: 'offered' | 'answered' | 'rejected' | 'ended';
  offer?: any;
  answer?: any;
  created_at: string;
  isMinimized?: boolean;
}

export interface UserStatusStory {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  mediaUrl?: string;
  caption?: string;
  type: 'image' | 'text' | 'video';
  bgColor?: string;
  createdAt: string;
  viewers: string[];
  isExclusive?: boolean;
  musicTitle?: string;
  musicArtist?: string;
  musicUrl?: string;
  storagePath?: string;
}

export interface SocialPost {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  isVipCreator?: boolean;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  tags: string[];
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
  isExclusive?: boolean; // Creator exclusive post
  tipsEarned?: number;
  createdAt: string;
  aiCategory?: string;
  aiEngagementScore?: number;
}

export interface CreatorTip {
  id: string;
  postId?: string;
  creatorId: string;
  fromUserId: string;
  fromUserName: string;
  amount: number;
  currency: string;
  message?: string;
  createdAt: string;
}

export interface CreatorAnalytics {
  totalReach: number;
  totalImpressions: number;
  engagementRate: number;
  totalEarnings: number;
  subscribersCount: number;
  viewsHistory: { label: string; views: number; revenue: number }[];
}

export interface QueuedMessageItem {
  id: string;
  chatId: string;
  message: Message;
  queuedAt: string;
}

