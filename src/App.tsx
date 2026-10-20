import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
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
import { LiveStreamModal } from './components/LiveStreamModal';
import { CompanionSyncModal } from './components/CompanionSyncModal';
import { CallHistoryModal } from './components/CallHistoryModal';
import { callHistoryService } from './services/callHistoryService';
import { MessageCircle, Sparkles, Shield, Lock, Radio, Laptop, CircleDashed } from 'lucide-react';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<Room[]>(chatEngine.getRooms());
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chats' | 'status'>('chats');

  // WebRTC Call state
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isLiveStreamOpen, setIsLiveStreamOpen] = useState(false);
  const [isCompanionSyncOpen, setIsCompanionSyncOpen] = useState(false);
  const [isCallHistoryOpen, setIsCallHistoryOpen] = useState(false);

  // Subscribe to user and rooms
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setIsLoading(true);
      if (user) {
        // User is logged in, sync with Firestore and update chatEngine
        try {
          // This should ideally be a method on firebaseAuthService to get profile by UID
          // Since I don't have it, I'll use getDoc directly or assume syncGoogleUserProfile handles it.
          // Wait, syncGoogleUserProfile does exactly this!
          
          // Actually, I need to fetch the profile from Firestore.
          const { doc, getDoc } = await import('firebase/firestore');
          import('./config/firebase').then(({ db }) => {
            getDoc(doc(db, 'users', user.uid)).then((userSnap) => {
               if (userSnap.exists()) {
                 const profile = { ...userSnap.data(), id: user.uid, is_online: true } as Profile;
                 chatEngine.setCurrentUser(profile);
                 setCurrentUser(profile);
                 setIsAuthOpen(false);
               }
               setIsLoading(false);
            }).catch(() => setIsLoading(false));
          });
        } catch (err) {
          console.error('Auth state change profile fetch error:', err);
          setIsLoading(false);
        }
      } else {
        chatEngine.logout();
        setCurrentUser(null);
        setIsAuthOpen(true);
        setIsLoading(false);
      }
    });


    const unsubRooms = chatEngine.subscribeRooms((updatedRooms) => {
      setRooms((prev) => {
        const map = new Map<string, Room>();
        prev.forEach(r => map.set(r.id, r));
        updatedRooms.forEach(r => map.set(r.id, r));
        return Array.from(map.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      });
    });

    // Real-time subscription to all registered Firestore users
    let unsubUsers: (() => void) | null = null;
    try {
      unsubUsers = firebaseAuthService.subscribeToAllUsers();
    } catch (err) {
      console.warn('Real-time users subscription error:', err);
    }

    return () => {
      unsubAuth();
      unsubRooms();
      if (unsubUsers) unsubUsers();
    };
  }, []);

  // Sync active user profile with Firestore on login/change
  useEffect(() => {
    if (currentUser) {
      firebaseAuthService.syncUserProfile(currentUser).catch((err) => {
        console.warn('Sync current user profile error:', err);
      });
    }
  }, [currentUser]);

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

    const currentRooms = chatEngine.getRooms().filter(r => !r.is_group);
    setRooms(currentRooms);
    if (currentRooms.length > 0 && !activeRoomId && window.innerWidth >= 768) {
      setActiveRoomId(currentRooms[0].id);
    }

    const unsubLocalRooms = chatEngine.subscribeRooms((localRooms) => {
      const directLocalRooms = localRooms.filter(r => !r.is_group);
      setRooms(directLocalRooms);
      setActiveRoomId((currActive) => {
        if (currActive && !directLocalRooms.some(r => r.id === currActive)) {
          return directLocalRooms.length > 0 && window.innerWidth >= 768 ? directLocalRooms[0].id : '';
        }
        return currActive;
      });
    });

    let unsubFirestoreChats: (() => void) | null = null;
    try {
      unsubFirestoreChats = firebaseAuthService.subscribeToUserChats(currentUser.id, (fsRooms) => {
        const directFsRooms = (fsRooms || []).filter(r => !r.is_group);
        if (directFsRooms) {
          directFsRooms.forEach(r => chatEngine.saveRoom(r));
        }
        const localRooms = chatEngine.getRooms().filter(r => !r.is_group);
        const map = new Map<string, Room>();
        
        directFsRooms.forEach(r => map.set(r.id, r));
        localRooms.forEach(r => {
          if (!map.has(r.id)) {
            map.set(r.id, r);
          }
        });

        const merged = Array.from(map.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setRooms(merged);

        setActiveRoomId((currActive) => {
          if (currActive && !merged.some(r => r.id === currActive)) {
            return merged.length > 0 && window.innerWidth >= 768 ? merged[0].id : '';
          }
          if (!currActive && merged.length > 0 && window.innerWidth >= 768) {
            return merged[0].id;
          }
          return currActive;
        });
      });
    } catch (err) {
      console.warn('Firestore user chats warning:', err);
    }

    return () => {
      unsubLocalRooms();
      if (unsubFirestoreChats) unsubFirestoreChats();
    };
  }, [currentUser]);

  const handleSelectUserToChat = async (targetUser: Profile) => {
    if (currentUser) {
      chatEngine.saveProfile(targetUser);
      try {
        const chatId = await firebaseAuthService.getOrCreateDirectChat(currentUser.id, targetUser.id);
        const room = chatEngine.getOrCreatePrivateRoom(targetUser.id, chatId);
        
        setRooms((prev) => {
          const map = new Map<string, Room>();
          prev.forEach(r => map.set(r.id, r));
          map.set(room.id, room);
          return Array.from(map.values()).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        });
        setActiveRoomId(room.id);
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

      // Log outgoing call
      callHistoryService.addLog({
        peerId: callee.id,
        peerName: callee.display_name,
        peerAvatar: callee.avatar_url,
        type,
        direction: 'outgoing',
        durationSeconds: 0,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Failed to start call:', err);
      alert('Could not start call. Please check microphone/camera permissions.');
    }
  };

  const handleAcceptIncomingCall = async (call: CallSession) => {
    setIncomingCall(null);
    setActiveCall({ ...call, status: 'answered' });

    // Log incoming accepted call
    callHistoryService.addLog({
      peerId: call.callerId,
      peerName: call.callerName,
      peerAvatar: call.callerAvatar,
      type: call.type,
      direction: 'incoming',
      durationSeconds: 0,
      timestamp: new Date().toISOString()
    });

    await webrtcCallService.answerCall(
      call,
      (stream) => setLocalStream(stream),
      (stream) => setRemoteStream(stream)
    );
  };

  const handleRejectIncomingCall = async (callId: string) => {
    if (incomingCall) {
      // Log missed / rejected call
      callHistoryService.addLog({
        peerId: incomingCall.callerId,
        peerName: incomingCall.callerName,
        peerAvatar: incomingCall.callerAvatar,
        type: incomingCall.type,
        direction: 'missed',
        durationSeconds: 0,
        timestamp: new Date().toISOString()
      });
    }
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
      <header
        id="global-top-header"
        className={`${activeRoomId ? 'hidden' : 'flex'} bg-slate-900 text-white px-3 sm:px-4 py-2 sm:py-2.5 items-center justify-between border-b border-slate-800 text-xs shrink-0 gap-2`}
        style={{ display: activeRoomId ? 'none' : undefined }}
      >
        <div id="header-brand" className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-gradient-to-tr from-blue-600 via-cyan-500 to-purple-600 rounded-xl shadow-md text-white font-bold shrink-0">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 text-xs sm:text-sm truncate">NEX CHAT</span>
            <span className="text-[9px] font-bold text-cyan-400 tracking-wider uppercase -mt-0.5">Created by BKN BRAIN</span>
          </div>
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
            </div>

            <button
              onClick={() => setIsCallHistoryOpen(true)}
              className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition border border-slate-700 shrink-0"
              title="Call Logs & History"
            >
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 px-1">📞 Calls</span>
            </button>

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
      {currentUser && activeTab === 'chats' && !activeRoomId && <StatusStoriesBar currentUser={currentUser} />}

      {/* Main Workspace Frame */}
      <div id="app-workspace-body" className="flex-1 flex overflow-hidden relative bg-slate-950">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">Loading your session...</div>
        ) : !currentUser ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-gradient-to-b from-[#0b0e17] via-[#0f1424] to-[#0a0c14] relative overflow-hidden">
            <div className="absolute w-72 h-72 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute w-72 h-72 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
            
            <div className="p-4 bg-gradient-to-br from-blue-500/20 via-cyan-500/20 to-purple-500/20 rounded-3xl backdrop-blur-md border border-cyan-500/30 mb-4 shadow-2xl ring-1 ring-cyan-400/20 relative z-10">
              <MessageCircle className="w-12 h-12 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 relative z-10">Nex Chat</h2>
            <p className="text-xs font-bold text-cyan-400 tracking-widest uppercase mt-1 relative z-10">Created by BKN BRAIN</p>
            <p className="text-xs text-slate-400 mt-2 max-w-sm relative z-10">High-Performance Realtime Chat with AI Smart Replies & Translation.</p>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="mt-5 px-6 py-3 bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 hover:opacity-90 text-white font-extrabold rounded-2xl text-xs shadow-xl transition-all relative z-10 active:scale-95"
            >
              Log In / Sign Up
            </button>
          </div>
        ) : activeTab === 'status' ? (
          <StatusStoriesBar currentUser={currentUser} isFullTab={true} />
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
                onOpenCallHistory={() => setIsCallHistoryOpen(true)}
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
                <div id="no-active-chat-placeholder" className="flex-1 flex flex-col items-center justify-center bg-[#0a0d18] p-6 text-center text-slate-400 relative overflow-hidden">
                  <div className="absolute w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
                  <div className="absolute w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 via-cyan-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mb-3 border border-cyan-500/30 shadow-lg relative z-10">
                    <MessageCircle className="w-8 h-8 text-cyan-400" />
                  </div>
                  <h3 className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 relative z-10">Nex Chat</h3>
                  <p className="text-[10px] font-bold text-cyan-400 tracking-wider uppercase mt-0.5 relative z-10">Created by BKN BRAIN</p>
                  <p className="text-xs text-slate-400 mt-2 max-w-sm relative z-10">
                    Select a conversation from the left sidebar or search users to start messaging.
                  </p>
                  <button
                    onClick={() => setIsSearchOpen(true)}
                    className="mt-4 px-4 py-2.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs hover:opacity-90 shadow-md transition-all inline-flex items-center gap-1.5 relative z-10 active:scale-95"
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

      <CallHistoryModal
        isOpen={isCallHistoryOpen}
        onClose={() => setIsCallHistoryOpen(false)}
        onInitiateCall={handleInitiateCall}
      />
    </div>
  );
}


