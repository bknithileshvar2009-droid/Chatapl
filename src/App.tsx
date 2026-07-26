import React, { useState, useEffect } from 'react';
import { Profile, Room, CallSession } from './types';
import { chatEngine } from './services/chatEngine';
import { firebaseAuthService } from './services/firebaseAuthService';
import { webrtcCallService } from './services/webrtcCallService';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { AuthModal } from './components/AuthModal';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import { UserSearchModal } from './components/UserSearchModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { StatusStoriesBar } from './components/StatusStoriesBar';
import { CallModal } from './components/CallModal';
import { SocialFeed } from './components/SocialFeed';
import { LiveStreamModal } from './components/LiveStreamModal';
import { CompanionSyncModal } from './components/CompanionSyncModal';
import { MessageCircle, Sparkles, Flame, Shield, Lock, Radio, Laptop, CircleDashed } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(chatEngine.getCurrentUser());
  const [rooms, setRooms] = useState<Room[]>(chatEngine.getRooms());
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chats' | 'status' | 'feed'>('chats');

  // WebRTC Call state
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(!currentUser);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isLiveStreamOpen, setIsLiveStreamOpen] = useState(false);
  const [isCompanionSyncOpen, setIsCompanionSyncOpen] = useState(false);

  // Subscribe to user and rooms
  useEffect(() => {
    const unsubUser = chatEngine.subscribeCurrentUser((user) => {
      setCurrentUser(user);
      setIsAuthOpen(!user);
    });

    const unsubRooms = chatEngine.subscribeRooms((updatedRooms) => {
      setRooms((prev) => {
        const map = new Map<string, Room>();
        prev.forEach(r => map.set(r.id, r));
        updatedRooms.forEach(r => map.set(r.id, r));
        return Array.from(map.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      });
    });

    return () => {
      unsubUser();
      unsubRooms();
    };
  }, []);

  // WebRTC Incoming call listener and status cleanup
  useEffect(() => {
    if (!currentUser) return;

    const unsubIncoming = webrtcCallService.listenForIncomingCalls(currentUser.id, (call) => {
      setIncomingCall(call);
      webrtcCallService.startRingtone();
    });

    webrtcCallService.setOnCallEnded(() => {
      setActiveCall(null);
      setIncomingCall(null);
      setLocalStream(null);
      setRemoteStream(null);
    });

    return () => {
      unsubIncoming();
    };
  }, [currentUser]);

  // Sync rooms on mount or user change via Firestore & local
  useEffect(() => {
    if (!currentUser) return;

    const currentRooms = chatEngine.getRooms();
    setRooms(currentRooms);
    if (currentRooms.length > 0 && !activeRoomId && window.innerWidth >= 768) {
      setActiveRoomId(currentRooms[0].id);
    }

    let unsubFirestoreChats: (() => void) | null = null;
    try {
      unsubFirestoreChats = firebaseAuthService.subscribeToUserChats(currentUser.id, (fsRooms) => {
        if (fsRooms && fsRooms.length > 0) {
          setRooms((prev) => {
            const map = new Map<string, Room>();
            prev.forEach(r => map.set(r.id, r));
            fsRooms.forEach(r => map.set(r.id, r));
            const merged = Array.from(map.values());
            merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            return merged;
          });
          setActiveRoomId((currActive) => {
            if (!currActive && fsRooms.length > 0 && window.innerWidth >= 768) {
              return fsRooms[0].id;
            }
            return currActive;
          });
        }
      });
    } catch (err) {
      console.error('Firestore user chats error:', err);
    }

    return () => {
      if (unsubFirestoreChats) unsubFirestoreChats();
    };
  }, [currentUser]);

  const handleSelectUserToChat = async (targetUser: Profile) => {
    if (currentUser) {
      try {
        const chatId = await firebaseAuthService.getOrCreateDirectChat(currentUser.id, targetUser.id);
        const room = chatEngine.getOrCreatePrivateRoom(targetUser.id);
        room.id = chatId;
        
        setRooms((prev) => {
          const map = new Map<string, Room>();
          prev.forEach(r => map.set(r.id, r));
          map.set(chatId, { ...room, id: chatId });
          return Array.from(map.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        });
        setActiveRoomId(chatId);
      } catch (e) {
        const room = chatEngine.getOrCreatePrivateRoom(targetUser.id);
        setRooms(chatEngine.getRooms());
        setActiveRoomId(room.id);
      }
    }
  };

  const handleInitiateCall = async (type: 'audio' | 'video', callee: Profile) => {
    if (!currentUser) return;
    try {
      const callId = await webrtcCallService.initiateCall(
        type,
        { uid: currentUser.id, name: currentUser.display_name, avatar: currentUser.avatar_url },
        { uid: callee.id, name: callee.display_name, avatar: callee.avatar_url },
        (stream) => setLocalStream(stream),
        (stream) => setRemoteStream(stream)
      );

      setActiveCall({
        id: callId,
        type,
        callerId: currentUser.id,
        callerName: currentUser.display_name,
        callerAvatar: currentUser.avatar_url,
        calleeId: callee.id,
        calleeName: callee.display_name,
        calleeAvatar: callee.avatar_url,
        status: 'offered',
        created_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      alert('Could not start call. Please check microphone/camera permissions.');
    }
  };

  const handleAcceptIncomingCall = async (call: CallSession) => {
    setIncomingCall(null);
    setActiveCall({ ...call, status: 'answered' });

    await webrtcCallService.answerCall(
      call,
      (stream) => setLocalStream(stream),
      (stream) => setRemoteStream(stream)
    );
  };

  const handleRejectIncomingCall = async (callId: string) => {
    await webrtcCallService.rejectCall(callId);
    setIncomingCall(null);
  };

  const handleEndCall = async () => {
    if (activeCall) {
      await webrtcCallService.endCall(activeCall.id);
    }
    setActiveCall(null);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  return (
    <div id="app-root-layout" className="w-full h-[100dvh] bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden antialiased select-none max-w-full">
      {/* Top Main Navigation Bar */}
      <header id="global-top-header" className="bg-slate-900 text-white px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between border-b border-slate-800 text-xs shrink-0 gap-2">
        <div id="header-brand" className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-emerald-500 rounded-xl shadow-xs text-slate-950 font-bold shrink-0">
            <MessageCircle className="w-4 h-4" />
          </div>
          <span className="font-extrabold tracking-tight text-white text-xs sm:text-sm truncate">APEX MOBILE</span>
        </div>

        {/* Workspace Tab Switcher & Quick Actions */}
        {currentUser && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('chats')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition ${activeTab === 'chats' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Chats</span>
              </button>
              <button
                onClick={() => setActiveTab('status')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition relative ${activeTab === 'status' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                <CircleDashed className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Status</span>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shrink-0" />
              </button>
              <button
                onClick={() => setActiveTab('feed')}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition relative ${activeTab === 'feed' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Reels</span>
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping shrink-0" />
              </button>
            </div>

            <button
              onClick={() => setIsCompanionSyncOpen(true)}
              className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700 shrink-0"
              title="Pair Web Companion (WhatsApp Web)"
            >
              <Laptop className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            </button>
          </div>
        )}
      </header>

      {/* 24-Hour Expiring Status / Stories Bar */}
      {currentUser && activeTab === 'chats' && <StatusStoriesBar currentUser={currentUser} />}

      {/* Main Workspace Frame */}
      <div id="app-workspace-body" className="flex-1 flex overflow-hidden relative bg-slate-950">
        {!currentUser ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <MessageCircle className="w-12 h-12 text-emerald-500 mb-3 animate-pulse" />
            <h2 className="text-base font-bold text-white">Welcome to Apex Enterprise Mobile</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">E2EE Chat, WebRTC Video Calls, AI Core & Creator Monetization Suite.</p>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="mt-4 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-md transition-colors"
            >
              Log In / Sign Up
            </button>
          </div>
        ) : activeTab === 'status' ? (
          <StatusStoriesBar currentUser={currentUser} isFullTab={true} />
        ) : activeTab === 'feed' ? (
          <SocialFeed currentUser={currentUser} />
        ) : (
          <>
            {/* Sidebar Chat List */}
            <div className={`h-full ${activeRoomId ? 'hidden md:flex' : 'flex'} w-full md:w-auto`}>
              <Sidebar
                currentUser={currentUser}
                rooms={rooms}
                activeRoomId={activeRoomId}
                onSelectRoom={(roomId) => {
                  setActiveRoomId(roomId);
                  chatEngine.markRoomAsRead(roomId);
                  if (currentUser) {
                    firebaseAuthService.markMessagesAsRead(roomId, currentUser.id);
                  }
                }}
                onOpenNewChat={() => setIsSearchOpen(true)}
                onOpenNewGroup={() => setIsCreateGroupOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </div>

            {/* Chat Conversation View */}
            <main className={`flex-1 h-full ${activeRoomId ? 'flex' : 'hidden md:flex'}`}>
              {activeRoom ? (
                <ChatArea
                  currentUser={currentUser}
                  room={activeRoom}
                  onBackMobile={() => setActiveRoomId(null)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onInitiateCall={handleInitiateCall}
                />
              ) : (
                <div id="no-active-chat-placeholder" className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-400">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 border border-emerald-500/20">
                    <MessageCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Apex Enterprise Workspace</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Select a conversation from the left sidebar or search users to start messaging.
                  </p>
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="mt-4 px-4 py-2.5 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-emerald-400 shadow-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    Start New Chat
                  </button>
                </div>
              )}
            </main>
          </>
        )}
      </div>

      {/* WebRTC Audio & Video Call Modal */}
      <CallModal
        activeCall={activeCall}
        incomingCall={incomingCall}
        localStream={localStream}
        remoteStream={remoteStream}
        onEndCall={handleEndCall}
        onAcceptIncomingCall={handleAcceptIncomingCall}
        onRejectIncomingCall={handleRejectIncomingCall}
        currentUserId={currentUser?.id || ''}
      />

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setIsAuthOpen(false);
        }}
      />

      <ProfileSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
        onLogout={() => {
          chatEngine.logout();
          setCurrentUser(null);
          setIsAuthOpen(true);
        }}
      />

      <UserSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectUserToChat={handleSelectUserToChat}
      />

      {currentUser && isCreateGroupOpen && (
        <CreateGroupModal
          currentUser={currentUser}
          onClose={() => setIsCreateGroupOpen(false)}
          onGroupCreated={(groupId) => {
            setActiveRoomId(groupId);
          }}
        />
      )}

      {currentUser && (
        <CompanionSyncModal
          currentUser={currentUser}
          onClose={() => setIsCompanionSyncOpen(false)}
          isOpen={isCompanionSyncOpen}
        />
      )}
    </div>
  );
}


