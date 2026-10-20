import React, { useState, useRef } from 'react';
import { Room, Profile } from '../types';
import { 
  MessageSquarePlus, 
  Settings, 
  Search, 
  Users, 
  CheckCheck, 
  Check, 
  Lock,
  MessageCircle,
  X,
  Phone,
  Share2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { chatEngine } from '../services/chatEngine';
import { firebaseAuthService } from '../services/firebaseAuthService';

interface Props {
  currentUser: Profile;
  rooms: Room[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onOpenSettings: () => void;
  onOpenCallHistory?: () => void;
}

export const Sidebar: React.FC<Props> = ({
  currentUser,
  rooms,
  activeRoomId,
  onSelectRoom,
  onOpenNewChat,
  onOpenNewGroup,
  onOpenSettings,
  onOpenCallHistory,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [roomToDelete, setRoomToDelete] = useState<{ id: string; name: string } | null>(null);

  const pressTimerRef = useRef<any>(null);

  const totalUnreadCount = rooms.reduce((acc, r) => acc + (r.unread_count || 0), 0);

  const handleTouchStart = (roomId: string, name: string) => {
    pressTimerRef.current = setTimeout(() => {
      setRoomToDelete({ id: roomId, name });
    }, 500);
  };

  const handleTouchEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, roomId: string, name: string) => {
    e.preventDefault();
    setRoomToDelete({ id: roomId, name });
  };

  const handleConfirmDelete = async () => {
    if (roomToDelete) {
      const targetRoomId = roomToDelete.id;
      chatEngine.deleteRoom(targetRoomId);
      if (currentUser?.id) {
        firebaseAuthService.deleteFirestoreChat(targetRoomId, currentUser.id).catch(() => {});
      }
      if (targetRoomId === activeRoomId) {
        const remaining = filteredRooms.filter(r => r.id !== targetRoomId);
        if (remaining.length > 0) {
          onSelectRoom(remaining[0].id);
        } else {
          onSelectRoom('');
        }
      }
      setRoomToDelete(null);
    }
  };

  // Deduplicate rooms by ID to prevent duplicate React keys, strictly filter 1-on-1 direct rooms
  const uniqueRoomsMap = new Map<string, Room>();
  rooms.forEach(r => {
    if (r && r.id && !r.is_group && r.id !== 'room-general' && !r.name?.includes('Public Community') && !uniqueRoomsMap.has(r.id)) {
      uniqueRoomsMap.set(r.id, r);
    }
  });
  const uniqueRooms = Array.from(uniqueRoomsMap.values());

  const filteredRooms = uniqueRooms.filter((r) => {
    // Filter type
    if (filter === 'unread' && (!r.unread_count || r.unread_count === 0)) return false;

    // Search query
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();

    // Contact name or username match
    const otherProfiles = r.participant_profiles?.filter((p) => p.id !== currentUser.id) || [];
    const nameMatch = otherProfiles.some(
      (p) => p.display_name.toLowerCase().includes(query) || p.username.toLowerCase().includes(query)
    );
    if (nameMatch) return true;

    // Last message text match
    return r.last_message_text?.toLowerCase().includes(query) || false;
  });

  const formatRoomTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    
    // Same day
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <aside id="chat-sidebar" className="w-full md:w-80 lg:w-96 bg-[#1a1c20] border-r border-[#2d3139] flex flex-col h-full shrink-0">
      {/* Top Header */}
      <div id="sidebar-header" className="p-3.5 bg-[#1a1c20] text-white flex items-center justify-between border-b border-[#2d3139]">
        {/* User Info Avatar Button */}
        <button
          id="open-profile-btn"
          onClick={onOpenSettings}
          className="flex items-center gap-2.5 bg-[#2d3139]/80 border border-[#3b82f644] hover:bg-[#2d3139] px-2.5 py-1.5 rounded-2xl transition-all text-left"
          title="Account Settings"
        >
          <div className="relative">
            <img
              src={currentUser.avatar_url}
              alt={currentUser.display_name}
              className="w-8 h-8 rounded-[12px] object-cover ring-1 ring-blue-500/50"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#22c55e] rounded-full ring-2 ring-[#1a1c20]" />
          </div>
          <div className="hidden sm:block min-w-0">
            <p className="text-xs font-semibold text-white truncate max-w-[110px]">{currentUser.display_name}</p>
            <p className="text-[10px] text-blue-400 font-mono truncate">@{currentUser.username}</p>
          </div>
        </button>

        {/* Action Buttons */}
        <div id="sidebar-action-buttons" className="flex items-center gap-1.5">
          {onOpenCallHistory && (
            <button
              id="open-call-history-btn"
              onClick={onOpenCallHistory}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-[#2d3139] rounded-xl transition-colors"
              title="Call Logs & History"
            >
              <Phone className="w-4 h-4" />
            </button>
          )}

          <button
            id="open-new-chat-btn"
            onClick={onOpenNewChat}
            className="p-2 text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition-colors"
            title="Start New Direct Chat"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div id="sidebar-search-container" className="p-3 bg-[#1a1c20] border-b border-[#2d3139]">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-[#64748b]" />
          <input
            id="chat-list-search-input"
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-[#0f1115] text-xs text-[#f8fafc] placeholder-[#64748b] border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>

        {/* Filter Pills */}
        <div id="sidebar-filter-pills" className="flex items-center gap-1.5 mt-2.5">
          <button
            id="filter-all-btn"
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-xl text-[11px] font-semibold transition-all ${
              filter === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-[#0f1115] text-[#94a3b8] hover:bg-[#2d3139] border border-[#2d3139]'
            }`}
          >
            All
          </button>
          <button
            id="filter-unread-btn"
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
              filter === 'unread'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-[#0f1115] text-[#94a3b8] hover:bg-[#2d3139] border border-[#2d3139]'
            }`}
          >
            <span>Unread</span>
            {totalUnreadCount > 0 && (
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                filter === 'unread' ? 'bg-white text-blue-600' : 'bg-emerald-500 text-slate-950'
              }`}>
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Chat Room List */}
      <div id="chat-rooms-list" className="flex-1 overflow-y-auto divide-y divide-[#2d3139]/40">
        {filteredRooms.length === 0 ? (
          <div className="py-12 text-center text-[#64748b] p-4 space-y-2">
            <MessageCircle className="w-8 h-8 mx-auto text-[#2d3139]" />
            <p className="text-xs font-semibold text-slate-300">No chats found</p>
            <p className="text-[11px] text-[#64748b]">Click &quot;+&quot; at the top to search users and start a private 1-on-1 chat.</p>
            <button
              onClick={onOpenNewChat}
              className="mt-2 px-3.5 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-500 transition-colors inline-flex items-center gap-1.5"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Find Users
            </button>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isSelected = room.id === activeRoomId;
            const otherProfiles = room.participant_profiles?.filter((p) => p.id !== currentUser.id) || [];
            let otherUser = otherProfiles[0];

            if (!otherUser && !room.is_group) {
              const allProfiles = chatEngine.getAllProfiles();
              otherUser = allProfiles.find(p => p.id !== currentUser.id);
            }

            const roomTitle = room.is_group
              ? (room.name || 'Group Chat')
              : (otherUser?.display_name || room.name || 'Private Chat');

            const roomAvatar = room.is_group
              ? 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=250'
              : otherUser?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250';

            return (
              <div
                key={room.id}
                id={`room-item-${room.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectRoom(room.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectRoom(room.id);
                  }
                }}
                onTouchStart={() => handleTouchStart(room.id, roomTitle)}
                onTouchEnd={handleTouchEnd}
                onMouseDown={() => handleTouchStart(room.id, roomTitle)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                onContextMenu={(e) => handleContextMenu(e, room.id, roomTitle)}
                className={`w-full px-4 py-3.5 flex items-center gap-3 text-left transition-all relative group cursor-pointer ${
                  isSelected ? 'bg-[#2d3139] border-l-4 border-blue-500' : 'hover:bg-[#2d3139]/60 border-l-4 border-transparent'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <img
                    src={roomAvatar}
                    alt={roomTitle}
                    className="w-11 h-11 rounded-[14px] object-cover bg-[#334155] border border-[#2d3139]"
                  />
                  {!room.is_group && otherUser?.is_online ? (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#22c55e] rounded-full ring-2 ring-[#1a1c20]" />
                  ) : null}
                  {room.is_group ? (
                    <span className="absolute -bottom-1 -right-1 p-0.5 bg-[#0f1115] text-white rounded-full border border-[#2d3139]">
                      <Users className="w-2.5 h-2.5 text-blue-400" />
                    </span>
                  ) : null}

                  {/* Avatar Unread Overlay Badge */}
                  {room.unread_count && room.unread_count > 0 ? (
                    <span
                      id={`unread-avatar-badge-${room.id}`}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-slate-950 font-black text-[10px] rounded-full ring-2 ring-[#1a1c20] flex items-center justify-center shadow-lg animate-pulse"
                      title={`${room.unread_count} unread message${room.unread_count > 1 ? 's' : ''}`}
                    >
                      {room.unread_count > 99 ? '99+' : room.unread_count}
                    </span>
                  ) : null}
                </div>

                {/* Info & Last Message */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <h3 className={`text-[14px] truncate ${room.unread_count && room.unread_count > 0 ? 'font-extrabold text-white' : 'font-semibold text-[#f8fafc]'}`}>
                        {roomTitle}
                      </h3>
                      {!room.is_group && otherUser?.username ? (
                        <span className="text-[11px] font-mono text-emerald-400 opacity-90 truncate shrink-0">@{otherUser.username}</span>
                      ) : null}
                      {!room.is_group && otherUser?.is_private ? (
                        <Lock className="w-3 h-3 text-amber-400 shrink-0" title="Private Account" />
                      ) : null}
                    </div>
                    <span className={`text-[11px] shrink-0 font-medium ${room.unread_count && room.unread_count > 0 ? 'text-emerald-400 font-extrabold' : 'text-[#64748b]'}`}>
                      {formatRoomTime(room.last_message_time)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[13px] truncate flex-1 ${room.unread_count && room.unread_count > 0 ? 'font-bold text-slate-100' : 'text-[#94a3b8]'}`}>
                      {room.last_message_text || 'No messages yet'}
                    </p>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Delete button icon visible on desktop hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRoomToDelete({ id: room.id, name: roomTitle });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 hover:bg-[#383d47] rounded-lg transition-all"
                        title="Remove chat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Unread Message Badge */}
                      {room.unread_count && room.unread_count > 0 ? (
                        <span
                          id={`unread-badge-${room.id}`}
                          className="px-2 py-0.5 bg-emerald-500 text-slate-950 font-black rounded-full text-[11px] min-w-[22px] text-center shadow-md animate-pulse border border-emerald-300 flex items-center justify-center leading-none"
                          title={`${room.unread_count} unread message${room.unread_count > 1 ? 's' : ''}`}
                        >
                          {room.unread_count > 99 ? '99+' : room.unread_count}
                        </span>
                      ) : (
                        <CheckCheck className="w-3.5 h-3.5 text-blue-400 opacity-80" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Long Press / Delete Confirmation Modal */}
      {roomToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#1a1c20] border border-[#2d3139] rounded-2xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">Remove Chat</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to remove <span className="font-semibold text-white">{roomToDelete.name}</span> from your chat list?
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setRoomToDelete(null)}
                className="flex-1 py-2 px-4 bg-[#2d3139] hover:bg-[#383d47] text-slate-200 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-md"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
