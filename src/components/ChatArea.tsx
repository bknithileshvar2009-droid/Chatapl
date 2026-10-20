import React, { useState, useEffect, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { Room, Profile, Message, MessageType, TypingStatus, EphemeralTimer } from '../types';
import { chatEngine } from '../services/chatEngine';
import { firebaseAuthService } from '../services/firebaseAuthService';
import { webrtcCallService } from '../services/webrtcCallService';
import { chatThemeService } from '../services/chatThemeService';
import { e2eEncryptionService } from '../services/e2eEncryptionService';
import { offlineSyncService } from '../services/offlineSyncService';
import { encryptMessage, decryptMessage, getRoomChannelKey } from '../utils/crypto';
import { VoiceRecorder } from './VoiceRecorder';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { GroupInfoModal } from './GroupInfoModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { MiniAppContainer } from './MiniAppContainer';
import { useLocalInference } from '../hooks/useLocalInference';
import { 
  ArrowLeft, 
  Send, 
  Paperclip, 
  Smile, 
  Mic, 
  Phone, 
  Video, 
  MoreVertical, 
  Check, 
  CheckCheck, 
  Image as ImageIcon, 
  Camera,
  Maximize2,
  X, 
  Lock, 
  Search,
  Play,
  Pause,
  Reply,
  Trash2,
  Users,
  Info,
  Clock,
  Sparkles,
  ShieldCheck,
  Timer,
  ShoppingBag,
  Ticket,
  CreditCard,
  Bot,
  Zap,
  BotMessageSquare,
  PenTool,
  Forward,
  Share2,
  CornerUpRight
} from 'lucide-react';

interface Props {
  currentUser: Profile;
  room: Room;
  onBackMobile: () => void;
  onOpenSettings: () => void;
  onInitiateCall: (type: 'audio' | 'video', callee: Profile) => void;
}

const EMOJI_LIST = ['👍', '❤️', '😂', '🔥', '🎉', '👏', '🙌', '🚀', '💯', '😊', '😍', '🙏'];
const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥', '🙏', '🎉'];

const DecryptedMessage: React.FC<{ content: string; roomId: string; isDeleted?: boolean }> = ({ content, roomId, isDeleted }) => {
  if (isDeleted) {
    return <p className="italic opacity-60 text-xs flex items-center gap-1"><Trash2 size={12} /> This message was deleted</p>;
  }
  const channelKey = getRoomChannelKey(roomId);
  const displayText = decryptMessage(content, channelKey);

  return <p className="whitespace-pre-wrap break-words">{displayText}</p>;
};

export const ChatArea: React.FC<Props> = ({ currentUser, room, onBackMobile, onOpenSettings, onInitiateCall }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearchInChat, setShowSearchInChat] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [previewImageModalUrl, setPreviewImageModalUrl] = useState<string | null>(null);
  const [themePatternId, setThemePatternId] = useState<string>(chatThemeService.getThemePattern());
  const [bubbleColor, setBubbleColor] = useState<string>(chatThemeService.getBubbleColor());

  // Local AI & Mini-Apps Engine
  const { isSummarizing, summaryResult, summarizeThreadLocally } = useLocalInference();
  const [miniAppType, setMiniAppType] = useState<'tickets' | 'food' | 'payment' | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showMiniAppMenu, setShowMiniAppMenu] = useState(false);

  // Enterprise AI Smart Reply, Ephemeral & Offline state
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isFetchingAiReplies, setIsFetchingAiReplies] = useState(false);
  const [disappearingTimer, setDisappearingTimer] = useState<EphemeralTimer>(room.disappearing_timer || 'off');
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(offlineSyncService.getIsOnline());
  const [offlineQueuedCount, setOfflineQueuedCount] = useState(0);

  // Forward Message state
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [recentRooms, setRecentRooms] = useState<Room[]>([]);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [sentRoomIds, setSentRoomIds] = useState<{ [roomId: string]: boolean }>({});

  // Header options dropdown & Clear Chat states
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);

  const handleClearChatHistory = async () => {
    setIsClearingChat(true);
    try {
      if (isOnline) {
        await firebaseAuthService.clearChatHistory(room.id);
      }
      chatEngine.clearChatHistory(room.id);
      setMessages([]);
    } catch (e) {
      console.error('Error clearing chat history:', e);
    } finally {
      setIsClearingChat(false);
      setShowClearChatConfirm(false);
      setShowMoreMenu(false);
    }
  };

  useEffect(() => {
    if (showForwardModal) {
      setSentRoomIds({});
      setForwardSearchQuery('');

      // Populate local rooms
      const localRooms = chatEngine.getRooms();
      setRecentRooms(localRooms);

      // Subscribe to Firestore rooms
      let unsubFirestore: (() => void) | null = null;
      try {
        unsubFirestore = firebaseAuthService.subscribeToUserChats(currentUser.id, (fRooms) => {
          if (fRooms && fRooms.length > 0) {
            setRecentRooms(fRooms);
          }
        });
      } catch (e) {
        console.error('Error fetching chats for forward modal:', e);
      }

      return () => {
        if (unsubFirestore) unsubFirestore();
      };
    }
  }, [showForwardModal, currentUser.id]);

  // Subscribe to offline status
  useEffect(() => {
    const unsubscribe = offlineSyncService.subscribe((online, count) => {
      setIsOnline(online);
      setOfflineQueuedCount(count);
    });
    return unsubscribe;
  }, []);

  // Fetch AI Smart Replies when last message changes
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_id !== currentUser.id && lastMsg.type === 'text') {
      setIsFetchingAiReplies(true);
      fetch('/api/ai/smart-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastMessage: lastMsg.content,
          conversationContext: messages.slice(-3).map(m => m.content).join(' | ')
        })
      })
        .then(res => res.json())
        .then(data => {
          if (data.replies) setSmartReplies(data.replies);
        })
        .catch(() => {
          setSmartReplies(["Sounds good! 👍", "I'm on it!", "Talk soon!"]);
        })
        .finally(() => setIsFetchingAiReplies(false));
    } else {
      setSmartReplies([]);
    }
  }, [messages.length, currentUser.id]);

  useEffect(() => {
    const unsubPattern = chatThemeService.subscribeThemePattern((newPatternId) => {
      setThemePatternId(newPatternId);
    });
    const unsubColor = chatThemeService.subscribeBubbleColor((newColor) => {
      setBubbleColor(newColor);
    });
    return () => {
      unsubPattern();
      unsubColor();
    };
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const handleAddEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    setTimeout(() => {
      textInputRef.current?.focus();
    }, 10);
  };

  // Close reaction popup on outside click
  useEffect(() => {
    const handleDocumentClick = () => {
      setActiveReactionMsgId(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  const handleTouchStart = (msgId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setActiveReactionMsgId(msgId);
    }, 400);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const remoteTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load messages & mark read
  useEffect(() => {
    chatEngine.markRoomAsRead(room.id);
    firebaseAuthService.markMessagesAsRead(room.id, currentUser.id);
    setMessages(chatEngine.getMessages(room.id));

    const unsubscribeMsgs = chatEngine.subscribeMessages(() => {
      const localMsgs = chatEngine.getMessages(room.id);
      setMessages(localMsgs);
      chatEngine.markRoomAsRead(room.id);
    });

    let unsubscribeFirestoreMsgs: (() => void) | null = null;
    try {
      unsubscribeFirestoreMsgs = firebaseAuthService.subscribeToChatMessages(
        room.id,
        currentUser.id,
        (firestoreMsgs) => {
          chatEngine.saveMessages(room.id, firestoreMsgs || []);
          const updatedMsgs = chatEngine.getMessages(room.id);
          setMessages(updatedMsgs);
          firebaseAuthService.markMessagesAsRead(room.id, currentUser.id);
        }
      );
    } catch {
      // Fallback
    }

    const unsubscribeTyping = chatEngine.subscribeTyping((status: TypingStatus) => {
      if (status.roomId === room.id && status.userId !== currentUser.id) {
        if (status.isTyping) {
          const profiles = chatEngine.getAllProfiles();
          const prof = profiles.find(p => p.id === status.userId);
          const roomParticipants = room.participant_profiles?.filter(p => p.id !== currentUser.id) || [];
          const matchedPart = roomParticipants.find(p => p.id === status.userId);

          const rawName = status.displayName || prof?.display_name || matchedPart?.display_name || status.username || prof?.username || 'Member';
          const username = status.username || prof?.username || matchedPart?.username;
          const handle = username ? ` (@${username})` : '';
          const typingNameWithUsername = `${rawName}${handle}`;

          setTypingUser(typingNameWithUsername);

          if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
          remoteTypingTimeoutRef.current = setTimeout(() => {
            setTypingUser(null);
          }, 3500);
        } else {
          if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
          setTypingUser(null);
        }
      }
    });

    let unsubscribeFirestoreTyping: (() => void) | null = null;
    try {
      unsubscribeFirestoreTyping = firebaseAuthService.subscribeToTyping(
        room.id,
        currentUser.id,
        (typingUserIds) => {
          if (typingUserIds.length > 0) {
            const firstTypingId = typingUserIds[0];
            const profiles = chatEngine.getAllProfiles();
            const prof = profiles.find(p => p.id === firstTypingId);
            const roomParticipants = room.participant_profiles?.filter(p => p.id !== currentUser.id) || [];
            const matchedPart = roomParticipants.find(p => p.id === firstTypingId);

            const rawName = prof?.display_name || matchedPart?.display_name || prof?.username || 'Member';
            const username = prof?.username || matchedPart?.username;
            const handle = username ? ` (@${username})` : '';
            const typingNameWithUsername = `${rawName}${handle}`;

            setTypingUser(typingNameWithUsername);
          } else {
            setTypingUser(null);
          }
        }
      );
    } catch {
      // Fallback
    }

    return () => {
      unsubscribeMsgs();
      if (unsubscribeFirestoreMsgs) unsubscribeFirestoreMsgs();
      if (unsubscribeFirestoreTyping) unsubscribeFirestoreTyping();
      unsubscribeTyping();
      if (remoteTypingTimeoutRef.current) clearTimeout(remoteTypingTimeoutRef.current);
    };
  }, [room.id, currentUser.id]);

  // Auto Scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUser]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);

    if (val.trim().length > 0) {
      chatEngine.setTyping(room.id, true, currentUser.id);
      firebaseAuthService.setFirestoreTyping(room.id, currentUser.id, true);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        chatEngine.setTyping(room.id, false, currentUser.id);
        firebaseAuthService.setFirestoreTyping(room.id, currentUser.id, false);
      }, 2500);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      chatEngine.setTyping(room.id, false, currentUser.id);
      firebaseAuthService.setFirestoreTyping(room.id, currentUser.id, false);
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const rawContent = text.trim();
    if (!rawContent) return;

    const replyId = replyToMessage?.id;

    // Immediately remove text from message bar on send
    setText('');
    setReplyToMessage(null);
    setSmartReplies([]);
    setShowEmojiPicker(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    chatEngine.setTyping(room.id, false, currentUser.id);
    firebaseAuthService.setFirestoreTyping(room.id, currentUser.id, false);

    // Maintain focus and auto-scroll
    setTimeout(() => {
      textInputRef.current?.focus();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 10);

    // E2EE encryption layer
    const encrypted = e2eEncryptionService.encryptMessage(rawContent);
    const expiresAt = e2eEncryptionService.calculateEphemeralExpiration(disappearingTimer);

    const participantIds = Array.from(new Set([
      currentUser.id,
      ...(room.participant_profiles?.map(p => p.id) || []),
      ...room.id.split('_direct_').filter(Boolean)
    ]));

    // Save to local chat engine immediately for instant UI & BroadcastChannel tab sync
    chatEngine.sendMessage(room.id, rawContent, 'text', undefined, replyId);

    if (!isOnline) {
      // Offline message queue
      const queuedMsg: Message = {
        id: 'msg_offline_' + Date.now(),
        room_id: room.id,
        sender_id: currentUser.id,
        content: rawContent,
        type: 'text',
        status: 'queued',
        created_at: new Date().toISOString(),
        is_queued_offline: true,
        expires_at: expiresAt
      };
      offlineSyncService.enqueueMessage(room.id, queuedMsg);
    } else {
      firebaseAuthService.sendFirestoreMessage(
        room.id,
        currentUser.id,
        rawContent,
        'text',
        undefined,
        replyId,
        undefined,
        participantIds
      ).catch((err) => {
        console.warn('Firestore send failed, storing in offline queue:', err);
        const queuedMsg: Message = {
          id: 'msg_offline_' + Date.now(),
          room_id: room.id,
          sender_id: currentUser.id,
          content: rawContent,
          type: 'text',
          status: 'queued',
          created_at: new Date().toISOString(),
          is_queued_offline: true,
          expires_at: expiresAt
        };
        offlineSyncService.enqueueMessage(room.id, queuedMsg);
      });
    }
  };

  const handleSendTextCustom = async (customText: string) => {
    const rawContent = customText.trim();
    if (!rawContent) return;

    // Immediately remove text from message bar on custom send (e.g. AI smart reply)
    setText('');
    setSmartReplies([]);
    setShowEmojiPicker(false);
    setReplyToMessage(null);

    setTimeout(() => {
      textInputRef.current?.focus();
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 10);

    const participantIds = Array.from(new Set([
      currentUser.id,
      ...(room.participant_profiles?.map(p => p.id) || []),
      ...room.id.split('_direct_').filter(Boolean)
    ]));
    
    // Save to local chat engine immediately for instant UI & BroadcastChannel tab sync
    chatEngine.sendMessage(room.id, rawContent, 'text');

    if (!isOnline) {
      const queuedMsg: Message = {
        id: 'msg_offline_' + Date.now(),
        room_id: room.id,
        sender_id: currentUser.id,
        content: rawContent,
        type: 'text',
        created_at: new Date().toISOString(),
        status: 'queued',
        is_queued_offline: true
      };
      offlineSyncService.enqueueMessage(room.id, queuedMsg);
    } else {
      firebaseAuthService.sendFirestoreMessage(
        room.id,
        currentUser.id,
        rawContent,
        'text',
        undefined,
        undefined,
        undefined,
        participantIds
      ).catch((err) => {
        console.warn('Firestore custom send failed, storing in offline queue:', err);
        const queuedMsg: Message = {
          id: 'msg_offline_' + Date.now(),
          room_id: room.id,
          sender_id: currentUser.id,
          content: rawContent,
          type: 'text',
          created_at: new Date().toISOString(),
          status: 'queued',
          is_queued_offline: true
        };
        offlineSyncService.enqueueMessage(room.id, queuedMsg);
      });
    }
  };

  const handleSendVoiceNote = async (audioBlob: Blob, durationSeconds: number) => {
    setIsUploadingVoice(true);
    try {
      const duration = Math.max(1, durationSeconds);
      let audioUrl = '';

      // Upload audio clip blob to Firebase Storage
      try {
        const fileExt = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
        const storagePath = `voice_notes/${room.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
        const storageRef = ref(storage, storagePath);
        const metadata = { contentType: audioBlob.type || 'audio/webm' };

        const snapshot = await uploadBytes(storageRef, audioBlob, metadata);
        audioUrl = await getDownloadURL(snapshot.ref);
        console.log('Voice clip uploaded to Firebase Storage:', audioUrl);
      } catch (storageErr) {
        console.warn('Firebase Storage upload failed/bypassed, falling back to data URL:', storageErr);
        audioUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(audioBlob);
        });
      }

      const replyId = replyToMessage?.id;
      setReplyToMessage(null);
      const participantIds = Array.from(new Set([
        currentUser.id,
        ...(room.participant_profiles?.map(p => p.id) || []),
        ...room.id.split('_direct_').filter(Boolean)
      ]));

      if (isOnline) {
        await firebaseAuthService.sendFirestoreMessage(
          room.id,
          currentUser.id,
          `Voice message (${duration}s)`,
          'audio',
          audioUrl,
          replyId,
          duration,
          participantIds
        );
      }

      chatEngine.sendMessage(
        room.id,
        `Voice message (${duration}s)`,
        'audio',
        audioUrl,
        replyId,
        duration
      );

      setIsVoiceRecording(false);
    } catch (err) {
      console.error('Error sending voice note:', err);
    } finally {
      setIsUploadingVoice(false);
    }
  };

  const handleSendPhoto = async (dataUrl: string, caption: string) => {
    try {
      const replyId = replyToMessage?.id;
      setReplyToMessage(null);
      const participantIds = Array.from(new Set([
        currentUser.id,
        ...(room.participant_profiles?.map(p => p.id) || []),
        ...room.id.split('_direct_').filter(Boolean)
      ]));

      chatEngine.sendMessage(
        room.id,
        caption || '📷 Photo',
        'image',
        dataUrl,
        replyId
      );

      await firebaseAuthService.sendFirestoreMessage(
        room.id,
        currentUser.id,
        caption || '📷 Photo',
        'image',
        dataUrl,
        replyId,
        undefined,
        participantIds
      );
    } catch (err) {
      console.error('Error sending photo:', err);
    }
  };

  const handleDirectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleSendPhoto(reader.result, '');
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleToggleReaction = (msgId: string, emoji: string) => {
    chatEngine.toggleReaction(msgId, emoji);
    firebaseAuthService.toggleMessageReaction(room.id, msgId, currentUser.id, emoji);
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    if (!confirm('Delete this message for everyone?')) return;
    await firebaseAuthService.softDeleteMessage(room.id, msgId, currentUser.id);
  };

  const handleForwardToRoom = async (targetRoom: Room) => {
    if (!forwardMessage) return;

    const channelKey = getRoomChannelKey(room.id);
    let rawContent = forwardMessage.content;
    if (forwardMessage.type === 'text') {
      rawContent = decryptMessage(forwardMessage.content, channelKey);
    }

    try {
      // Send via Firestore
      await firebaseAuthService.sendFirestoreMessage(
        targetRoom.id,
        currentUser.id,
        rawContent,
        forwardMessage.type,
        forwardMessage.attachment_url
      );

      // Send via ChatEngine
      chatEngine.sendMessage(
        targetRoom.id,
        rawContent,
        forwardMessage.type,
        forwardMessage.attachment_url
      );

      setSentRoomIds((prev) => ({ ...prev, [targetRoom.id]: true }));
    } catch (err) {
      console.error('Failed to forward message:', err);
    }
  };

  const otherProfiles = room.participant_profiles?.filter((p) => p.id !== currentUser.id) || [];
  let otherUser = otherProfiles[0];

  if (!otherUser && !room.is_group) {
    const allProfiles = chatEngine.getAllProfiles();
    otherUser = allProfiles.find(p => p.id !== currentUser.id);
  }

  const roomTitle = room.is_group
    ? (room.name || 'Group Chat')
    : (otherUser?.display_name || room.name || 'Private Room');

  const roomAvatar = room.is_group
    ? (room.group_icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${room.name}`)
    : otherUser?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250';

  const rawFiltered = searchInChat.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchInChat.toLowerCase()))
    : messages;

  const uniqueMsgMap = new Map<string, Message>();
  rawFiltered.forEach(m => {
    if (m && m.id && !uniqueMsgMap.has(m.id)) {
      uniqueMsgMap.set(m.id, m);
    }
  });
  const filteredMessages = Array.from(uniqueMsgMap.values());

  return (
    <div id="active-chat-container" className="flex-1 flex flex-col h-full bg-[#0f1115] relative overflow-hidden">
      {/* Active Chat Header */}
      <div id="chat-header" className="px-3 sm:px-5 py-2.5 sm:py-3.5 bg-[#1a1c20] text-white flex items-center justify-between border-b border-[#2d3139] shadow-xs z-10 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 cursor-pointer" onClick={() => room.is_group && setShowGroupInfoModal(true)}>
          <button
            id="mobile-back-btn"
            onClick={(e) => { e.stopPropagation(); onBackMobile(); }}
            className="p-2 text-slate-300 hover:text-white rounded-xl bg-slate-800/80 hover:bg-[#2d3139] transition-colors shrink-0 flex items-center justify-center border border-slate-700/60"
            title="Back to Chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative shrink-0">
            <img
              src={roomAvatar}
              alt={roomTitle}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-[14px] object-cover ring-1 ring-emerald-500/40 bg-[#334155]"
            />
            {!room.is_group && otherUser?.is_online ? (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#22c55e] rounded-full ring-2 ring-[#1a1c20]" />
            ) : null}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <h2 className="text-xs sm:text-sm font-bold text-[#f8fafc] truncate">{roomTitle}</h2>
              {!room.is_group && otherUser?.username && (
                <span className="hidden sm:inline-block text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold shrink-0">
                  @{otherUser.username}
                </span>
              )}
              {room.is_group && (
                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded">
                  Group
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-[#22c55e] font-medium truncate flex items-center gap-1">
              {typingUser ? (
                <span id="active-typing-header-status" className="text-emerald-400 font-bold flex items-center gap-1.5 animate-in fade-in">
                  <span className="flex gap-0.5 items-center">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span>{typingUser} typing...</span>
                </span>
              ) : room.is_group ? (
                `${room.participant_profiles?.length || 0} members`
              ) : otherUser?.is_online ? (
                'Online'
              ) : (
                <span className="text-slate-500">Offline</span>
              )}
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Ephemeral Disappearing Messages Selector */}
          <div className="relative">
            <button
              onClick={() => setShowTimerMenu(!showTimerMenu)}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-[#2d3139] hover:bg-slate-700 text-emerald-400 text-[11px] sm:text-xs font-semibold transition"
              title="Disappearing Messages Timer"
            >
              <Timer className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xs:inline">{disappearingTimer === 'off' ? 'Off' : disappearingTimer}</span>
            </button>

            {showTimerMenu && (
              <div className="absolute right-0 top-10 z-40 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-2xl w-36 space-y-1 text-xs">
                <span className="block px-2 py-1 text-[10px] text-slate-400 font-semibold uppercase">Auto Disappear</span>
                {(['off', '24h', '7d', '90d'] as EphemeralTimer[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setDisappearingTimer(t);
                      setShowTimerMenu(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between font-medium ${disappearingTimer === t ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    <span>{t === 'off' ? 'Off' : t}</span>
                    {disappearingTimer === t && <Check className="w-3 h-3 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mini-Apps Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowMiniAppMenu(!showMiniAppMenu)}
              className="p-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold"
              title="Launch Super-App Mini Programs"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline">Mini-Apps</span>
            </button>

            {showMiniAppMenu && (
              <div className="absolute right-0 top-10 z-50 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl w-48 space-y-1 text-xs">
                <span className="block px-2.5 py-1 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Super-App Mini Programs</span>
                <button
                  onClick={() => {
                    setMiniAppType('tickets');
                    setShowMiniAppMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-800 text-slate-200 font-bold transition"
                >
                  <Ticket className="w-4 h-4 text-emerald-400" /> Event Tickets
                </button>
                <button
                  onClick={() => {
                    setMiniAppType('food');
                    setShowMiniAppMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-800 text-slate-200 font-bold transition"
                >
                  <ShoppingBag className="w-4 h-4 text-amber-400" /> Express Food Order
                </button>
                <button
                  onClick={() => {
                    setMiniAppType('payment');
                    setShowMiniAppMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-800 text-slate-200 font-bold transition"
                >
                  <CreditCard className="w-4 h-4 text-blue-400" /> Apex Pay Transfer
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setShowSearchInChat(!showSearchInChat)}
            className="p-2 text-slate-400 hover:text-white hover:bg-[#2d3139] rounded-xl transition-colors"
            title="Search in conversation"
          >
            <Search className="w-4 h-4" />
          </button>

          {!room.is_group && otherUser && (
            <>
              <button
                onClick={() => onInitiateCall('audio', otherUser)}
                className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-[#2d3139] rounded-xl transition-colors"
                title="Voice Call"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                onClick={() => onInitiateCall('video', otherUser)}
                className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-[#2d3139] rounded-xl transition-colors"
                title="Video Call"
              >
                <Video className="w-4 h-4" />
              </button>
            </>
          )}

          {room.is_group && (
            <button
              onClick={() => setShowGroupInfoModal(true)}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-[#2d3139] rounded-xl transition-colors"
              title="Group Settings"
            >
              <Info className="w-4 h-4" />
            </button>
          )}

          {/* Header Options Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 text-slate-400 hover:text-white hover:bg-[#2d3139] rounded-xl transition-colors"
              title="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-10 z-50 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl w-48 space-y-1 text-xs">
                <span className="block px-2.5 py-1 text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Chat Menu</span>
                
                <button
                  onClick={() => {
                    setShowSearchInChat(!showSearchInChat);
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-800 text-slate-200 font-medium transition"
                >
                  <Search className="w-4 h-4 text-slate-400" /> Search in conversation
                </button>

                {room.is_group && (
                  <button
                    onClick={() => {
                      setShowGroupInfoModal(true);
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-800 text-slate-200 font-medium transition"
                  >
                    <Info className="w-4 h-4 text-emerald-400" /> Group Info
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenSettings();
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-slate-800 text-slate-200 font-medium transition"
                >
                  <Share2 className="w-4 h-4 text-blue-400" /> Share Profile
                </button>

                <div className="my-1 border-t border-slate-800" />

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowClearChatConfirm(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 hover:bg-red-500/20 text-red-400 font-bold transition"
                >
                  <Trash2 className="w-4 h-4 text-red-400" /> Clear Chat
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search Input Bar (Visible when toggled) */}
        {showSearchInChat && (
          <div className="absolute top-full left-0 right-0 p-2 bg-[#1a1c20] border-b border-[#2d3139] z-20 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchInChat}
              onChange={(e) => setSearchInChat(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button onClick={() => { setShowSearchInChat(false); setSearchInChat(''); }} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        )}
      </div>


      {/* Messages Stream Area */}
      {(() => {
        const activePattern = chatThemeService.getPatternById(themePatternId);
        return (
          <div 
            id="messages-stream" 
            className={`flex-1 overflow-y-auto p-5 space-y-4 transition-all duration-300 ${activePattern.bgClass}`}
            style={activePattern.style}
          >
            <div className="text-center my-2">
              <span className="px-3.5 py-1.5 bg-slate-900/90 text-[11px] font-medium text-slate-400 rounded-full border border-slate-800/80 backdrop-blur-md shadow-2xs inline-block">
                🔒 Client-side AES Encrypted Chat
              </span>
            </div>

            {filteredMessages.map((msg) => {
          const isSender = msg.sender_id === currentUser.id;
          const senderProfile = msg.sender_profile || room.participant_profiles?.find(p => p.id === msg.sender_id);
          const parentMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;

          const timeFormatted = new Date(msg.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          // Reactions calculation
          const reactionCounts: { [emoji: string]: { count: number; userReacted: boolean } } = {};
          if (msg.reactions && msg.reactions.length > 0) {
            msg.reactions.forEach((r) => {
              if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, userReacted: false };
              reactionCounts[r.emoji].count += 1;
              if (r.user_id === currentUser.id) reactionCounts[r.emoji].userReacted = true;
            });
          }
          const hasReactions = Object.keys(reactionCounts).length > 0;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSender ? 'items-end' : 'items-start'} group relative my-1`}
            >
              {/* Quick Reaction Floating Popover */}
              {activeReactionMsgId === msg.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute -top-11 ${isSender ? 'right-0' : 'left-0'} bg-slate-900 border border-slate-700 shadow-2xl rounded-full px-2.5 py-1 flex items-center gap-1 z-30`}
                >
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleReaction(msg.id, emoji);
                        setActiveReactionMsgId(null);
                      }}
                      className="text-lg p-1 hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setReplyToMessage(msg);
                      setActiveReactionMsgId(null);
                    }}
                    className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 text-xs ml-1"
                    title="Reply"
                  >
                    <Reply size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setForwardMessage(msg);
                      setShowForwardModal(true);
                      setActiveReactionMsgId(null);
                    }}
                    className="p-1 text-slate-400 hover:text-emerald-400 rounded-full hover:bg-slate-800 text-xs"
                    title="Forward Message"
                  >
                    <Forward size={14} />
                  </button>
                  {isSender && !msg.isDeleted && (
                    <button
                      onClick={() => handleDeleteForEveryone(msg.id)}
                      className="p-1 text-red-400 hover:text-red-300 rounded-full hover:bg-slate-800 text-xs"
                      title="Delete for Everyone"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Message Content Container */}
              <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${isSender ? 'flex-row-reverse' : 'flex-row'}`}>
                <img
                  src={isSender ? currentUser.avatar_url : (senderProfile?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250')}
                  alt="avatar"
                  className="w-7 h-7 rounded-full object-cover shrink-0 mb-1 border border-slate-700"
                />

                <div
                  onTouchStart={() => handleTouchStart(msg.id)}
                  onTouchEnd={handleTouchEnd}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id);
                  }}
                  style={isSender ? { backgroundColor: bubbleColor } : {}}
                  className={`rounded-[18px] px-4 py-2.5 shadow-md relative text-[14px] leading-relaxed cursor-pointer select-none transition-colors duration-200 ${
                    isSender
                      ? 'text-white rounded-br-[4px]'
                      : 'bg-slate-800 text-slate-100 rounded-bl-[4px] border border-slate-700/60'
                  }`}
                >
                  {/* Sender Name */}
                  <div className={`flex items-center justify-between gap-2 mb-1 border-b pb-0.5 ${isSender ? 'border-white/20' : 'border-slate-700/40'}`}>
                    <span className={`text-[11px] font-bold ${isSender ? 'text-white/90' : 'text-emerald-400'}`}>
                      {isSender ? 'You' : (senderProfile?.display_name || 'User')}
                    </span>
                  </div>

                  {/* Quoted Parent Reply Preview */}
                  {parentMsg && (
                    <div className="mb-2 p-2 rounded-lg bg-black/20 border-l-4 border-emerald-400 text-xs opacity-90">
                      <p className="font-semibold text-[10px] text-emerald-300">Replying to message</p>
                      <p className="truncate italic text-[11px]">{parentMsg.content}</p>
                    </div>
                  )}

                  {/* Message Body Types */}
                  {msg.type === 'audio' && (msg.attachment_url || msg.content) ? (
                    <VoiceMessageBubble 
                      audioUrl={msg.attachment_url || msg.content} 
                      duration={msg.audio_duration} 
                      isMe={isSender} 
                      initialTranscript={msg.transcript}
                    />
                  ) : (msg.type === 'image' || (msg.attachment_url && (msg.attachment_url.startsWith('data:image') || msg.attachment_url.match(/\.(jpeg|jpg|gif|png|webp)/i)))) ? (
                    <div className="space-y-1.5 my-1">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImageModalUrl(msg.attachment_url || null);
                        }}
                        className="relative group/img overflow-hidden rounded-xl border border-black/10 cursor-pointer max-w-xs shadow-xs bg-black/20"
                      >
                        <img 
                          src={msg.attachment_url} 
                          alt="Attachment" 
                          className="w-full h-auto max-h-64 object-cover hover:scale-105 transition-transform duration-300" 
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                          <Maximize2 className="w-6 h-6 text-white drop-shadow-md" />
                        </div>
                      </div>
                      {msg.content && msg.content !== '📷 Photo' && (
                        <p className="text-xs font-normal whitespace-pre-wrap break-words">{msg.content}</p>
                      )}
                    </div>
                  ) : (
                    <DecryptedMessage content={msg.content} roomId={room.id} isDeleted={msg.isDeleted} />
                  )}

                  {/* Timestamp & Sent/Delivered/Read Blue Tick Status */}
                  <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isSender ? 'text-emerald-100/80' : 'text-slate-400'}`}>
                    <span>{timeFormatted}</span>
                    {isSender && (
                      msg.status === 'queued' || msg.is_queued_offline ? (
                        <Clock size={14} className="text-amber-300 animate-pulse" title="Queued (Offline)" />
                      ) : msg.status === 'read' ? (
                        <CheckCheck size={14} className="text-sky-300 font-bold" title="Read" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck size={14} className="text-emerald-200" title="Delivered" />
                      ) : (
                        <Check size={14} className="text-emerald-200" title="Sent" />
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Reaction Badges */}
              {hasReactions && (
                <div className={`flex flex-wrap gap-1 mt-1 z-10 ${isSender ? 'justify-end' : 'justify-start'}`}>
                  {Object.entries(reactionCounts).map(([emoji, { count, userReacted }]) => (
                    <span
                      key={emoji}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleReaction(msg.id, emoji);
                      }}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer border ${
                        userReacted ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {emoji} {count > 1 && count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {/* Real-Time Typing Indicator Bubble in Message Thread */}
        {typingUser && (
          <div id="typing-bubble-indicator" className="flex items-center gap-2 mb-3 max-w-[80%] animate-in fade-in duration-200">
            <img
              src={room.is_group ? roomAvatar : (otherUser?.avatar_url || roomAvatar)}
              alt="Typing"
              className="w-7 h-7 rounded-full object-cover ring-1 ring-emerald-500/30 shrink-0"
            />
            <div className="bg-[#1a1c20] text-slate-300 border border-[#2d3139] px-3.5 py-2 rounded-2xl rounded-tl-xs flex items-center gap-2 text-xs shadow-xs">
              <span className="text-emerald-400 font-bold">{typingUser}</span>
              <span className="text-slate-400 text-[11px]">is typing...</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    );
  })()}

      {/* Offline Status Banner */}
      {!isOnline && (
        <div className="px-4 py-1.5 bg-amber-500/20 border-t border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
            Offline Mode — Messages queued locally
          </span>
          {offlineQueuedCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/30 rounded-full text-[10px] text-amber-200">
              {offlineQueuedCount} queued
            </span>
          )}
        </div>
      )}

      {/* Smart AI Quick Reply Chips Bar */}
      {smartReplies.length > 0 && !isVoiceRecording && (
        <div className="px-3 py-2 bg-[#121418] border-t border-slate-800 flex items-center gap-2 overflow-x-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-200 z-10">
          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 shrink-0 mr-1">
            <Sparkles size={13} className="animate-pulse text-emerald-400" />
            <span>AI Suggestions:</span>
          </div>
          {smartReplies.map((reply, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendTextCustom(reply)}
              className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-medium whitespace-nowrap transition-all active:scale-95 shrink-0 shadow-xs flex items-center gap-1"
            >
              <span>{reply}</span>
            </button>
          ))}
        </div>
      )}

      {/* Interactive Emoji Picker Popover */}
      {showEmojiPicker && !isVoiceRecording && (
        <div className="p-3 bg-slate-900 border-t border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-200 z-20">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Smile size={14} className="text-emerald-400" /> Emojis & Reactions
            </span>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-8 sm:grid-cols-10 gap-2 max-h-36 overflow-y-auto custom-scrollbar">
            {['👍', '❤️', '😂', '🔥', '🎉', '👏', '🙌', '🚀', '💯', '😊', '😍', '🙏', '⚡', '✨', '👌', '😎', '🤩', '🥳', '💡', '💬', '🤝', '⭐', '🎈', '🏆', '🎯', '📌', '🔔', '❤️‍🔥'].map((emoji, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAddEmoji(emoji)}
                className="text-xl p-1.5 hover:bg-slate-800 rounded-xl transition-transform hover:scale-125 flex items-center justify-center active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quoted Reply Input Bar */}
      {replyToMessage && (
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-white">
          <div className="flex items-center gap-2 border-l-2 border-emerald-400 pl-2">
            <Reply size={14} className="text-emerald-400" />
            <div>
              <p className="font-semibold text-[10px] text-emerald-400">Replying to message</p>
              <p className="text-slate-300 truncate max-w-xs text-[11px]">{replyToMessage.content}</p>
            </div>
          </div>
          <button onClick={() => setReplyToMessage(null)} className="text-slate-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Voice Recorder Bar or Text Input Bar */}
      {isVoiceRecording ? (
        <div className="p-3 bg-slate-900 border-t border-slate-800">
          <VoiceRecorder
            onSendVoiceNote={handleSendVoiceNote}
            onCancel={() => setIsVoiceRecording(false)}
            isUploading={isUploadingVoice}
          />
        </div>
      ) : (
        <div id="chat-input-bar" className="p-2 sm:p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-1 sm:gap-2 z-10">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`p-1.5 sm:p-2 rounded-xl transition-colors shrink-0 ${
              showEmojiPicker ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Emoji Picker"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowCameraModal(true)}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-emerald-400 rounded-xl hover:bg-slate-800 transition-colors shrink-0"
            title="Camera Photo Capture"
          >
            <Camera className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-emerald-400 rounded-xl hover:bg-slate-800 transition-colors shrink-0"
            title="Attach Image File"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleDirectFileUpload}
            className="hidden"
          />

          <form onSubmit={handleSendText} className="flex-1 flex items-center gap-1.5 sm:gap-2 min-w-0">
            <input
              ref={textInputRef}
              type="text"
              placeholder="Type a message..."
              value={text}
              onChange={handleInputChange}
              autoComplete="off"
              className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 min-w-0"
            />

            {text.trim() ? (
              <button
                type="submit"
                className="p-2 sm:p-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md transition-transform active:scale-95 shrink-0"
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsVoiceRecording(true)}
                className="p-2 sm:p-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl transition-colors shrink-0"
                title="Record Voice Note"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      )}

      {/* Camera Capture Modal */}
      {showCameraModal && (
        <CameraCaptureModal
          onSendPhoto={handleSendPhoto}
          onClose={() => setShowCameraModal(false)}
        />
      )}

      {/* Image Full-Screen Zoom Modal */}
      {previewImageModalUrl && (
        <div 
          onClick={() => setPreviewImageModalUrl(null)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-pointer"
        >
          <button
            onClick={() => setPreviewImageModalUrl(null)}
            className="absolute top-5 right-5 p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full transition-colors z-10 border border-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImageModalUrl}
            alt="Expanded view"
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}

      {/* Group Info Modal */}
      {showGroupInfoModal && (
        <GroupInfoModal
          room={room}
          currentUser={currentUser}
          onClose={() => setShowGroupInfoModal(false)}
          onUpdateGroup={() => {
            setShowGroupInfoModal(false);
          }}
        />
      )}

      {/* Mini-App Embedded Container */}
      {miniAppType && (
        <MiniAppContainer
          appType={miniAppType}
          onClose={() => setMiniAppType(null)}
          onSendToChat={(payloadText) => {
            handleSendTextCustom(payloadText);
          }}
        />
      )}

      {/* Forward Message Modal */}
      {showForwardModal && forwardMessage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 text-white shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Forward className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Forward Message</h3>
                  <p className="text-[11px] text-slate-400">Select recent chats to resend content</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowForwardModal(false);
                  setForwardMessage(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Preview Box */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 shrink-0 text-xs text-slate-300 flex items-center gap-3">
              {forwardMessage.type === 'image' && forwardMessage.attachment_url ? (
                <img
                  src={forwardMessage.attachment_url}
                  alt="Forward preview"
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-800"
                />
              ) : forwardMessage.type === 'audio' ? (
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
                  <Mic className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-2.5 bg-slate-800 text-slate-300 rounded-xl shrink-0">
                  <Paperclip className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Forwarding</span>
                <p className="truncate text-slate-200 font-medium">
                  {forwardMessage.type === 'image'
                    ? (forwardMessage.content || 'Photo Attachment')
                    : forwardMessage.type === 'audio'
                    ? 'Voice Note'
                    : decryptMessage(forwardMessage.content, getRoomChannelKey(room.id))}
                </p>
              </div>
            </div>

            {/* Search Input for Chats */}
            <div className="relative shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search recent chats..."
                value={forwardSearchQuery}
                onChange={(e) => setForwardSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            {/* List of Recent Chats */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {(() => {
                const filteredRooms = recentRooms.filter((r) => {
                  const otherParts = r.participant_profiles?.filter((p) => p.id !== currentUser.id) || [];
                  const other = otherParts[0];
                  const name = r.is_group ? (r.name || 'Group Chat') : (other?.display_name || 'Chat');
                  return name.toLowerCase().includes(forwardSearchQuery.toLowerCase());
                });

                if (filteredRooms.length === 0) {
                  return (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No recent chats found
                    </div>
                  );
                }

                return filteredRooms.map((r) => {
                  const otherParts = r.participant_profiles?.filter((p) => p.id !== currentUser.id) || [];
                  const otherUser = otherParts[0];
                  const roomTitle = r.is_group ? (r.name || 'Group Chat') : (otherUser?.display_name || 'Chat Member');
                  const roomAvatar = r.is_group
                    ? (r.group_icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${r.name}`)
                    : (otherUser?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250');

                  const isSent = sentRoomIds[r.id];

                  return (
                    <div
                      key={r.id}
                      className="p-2.5 rounded-2xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 flex items-center justify-between gap-3 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={roomAvatar}
                          alt={roomTitle}
                          className="w-10 h-10 rounded-full object-cover border border-slate-700/80 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-200 truncate">{roomTitle}</h4>
                          <p className="text-[11px] text-slate-400 truncate">
                            {r.last_message_text || (r.is_group ? 'Group Chat' : 'Direct Message')}
                          </p>
                        </div>
                      </div>

                      <button
                        disabled={isSent}
                        onClick={() => handleForwardToRoom(r)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                          isSent
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
                        }`}
                      >
                        {isSent ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Forwarded
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" /> Send
                          </>
                        )}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer Close Button */}
            <div className="pt-2 border-t border-slate-800 shrink-0">
              <button
                onClick={() => {
                  setShowForwardModal(false);
                  setForwardMessage(null);
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Chat Confirmation Modal */}
      {showClearChatConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 text-white shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-100">Clear Chat History?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Are you sure you want to delete all messages in <span className="font-semibold text-slate-200">{roomTitle}</span>? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                disabled={isClearingChat}
                onClick={() => setShowClearChatConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={isClearingChat}
                onClick={handleClearChatHistory}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2"
              >
                {isClearingChat ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Clear Chat'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
