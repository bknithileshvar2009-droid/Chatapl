import React, { useState, useEffect } from 'react';
import { Profile } from '../types';
import { chatEngine } from '../services/chatEngine';
import { firebaseAuthService } from '../services/firebaseAuthService';
import { X, Search, MessageSquarePlus, Lock, Globe, Sparkles } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectUserToChat: (user: Profile) => void;
}

export const UserSearchModal: React.FC<Props> = ({ isOpen, onClose, onSelectUserToChat }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);

  useEffect(() => {
    let isCancelled = false;

    if (isOpen) {
      const currentUser = chatEngine.getCurrentUser();
      const currentUid = currentUser?.id || '';

      const localResults = chatEngine.searchUsers(query).filter(p => p.id !== currentUid && p.id !== 'system');
      setResults(localResults);

      firebaseAuthService.searchUsers(query, currentUid).then((fsResults) => {
        if (isCancelled) return;
        setResults((prev) => {
          const map = new Map<string, Profile>();
          prev.forEach((p) => {
            if (p.id !== currentUid && p.id !== 'system') map.set(p.id, p);
          });
          fsResults.forEach((p) => {
            if (p.id !== currentUid && p.id !== 'system') map.set(p.id, p);
          });
          return Array.from(map.values());
        });
      }).catch((err) => console.error('Firestore user search error:', err));
    }

    return () => {
      isCancelled = true;
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  return (
    <div id="user-search-modal-overlay" className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div id="user-search-card" className="bg-[#1a1c20] rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col border border-[#2d3139] overflow-hidden text-[#f8fafc]">
        {/* Modal Header */}
        <div id="user-search-header" className="px-6 py-4 bg-[#1a1c20] text-white flex items-center justify-between border-b border-[#2d3139]">
          <div id="user-search-title" className="flex items-center gap-2.5">
            <MessageSquarePlus className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Find People & Start Chat</h2>
          </div>
          <button
            id="close-user-search-btn"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#2d3139] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Bar */}
        <div id="user-search-input-box" className="p-4 border-b border-[#2d3139] bg-[#1a1c20]">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-slate-400" />
            <input
              id="global-user-search-input"
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by display name or @username..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#0f1115] text-xs text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500 shadow-2xs placeholder-[#64748b]"
            />
          </div>
          <p id="private-search-hint" className="text-[11px] text-slate-400 mt-2 px-1 leading-normal">
            💡 <strong>Privacy Rule:</strong> Private profiles will only appear if you search their exact <code>@username</code> handle.
          </p>
        </div>

        {/* Search Results List */}
        <div id="user-search-results-list" className="p-4 overflow-y-auto flex-1 space-y-2">
          {results.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-blue-500/40 animate-pulse" />
              <p className="font-semibold text-white">
                {query.trim() ? `No users found for "${query}"` : 'No other users found yet.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {query.trim() 
                  ? 'If searching for a private account, make sure to include their exact @username.'
                  : 'Users who sign up or join will automatically appear here in real-time.'}
              </p>
            </div>
          ) : (
            <>
              {query.trim().length === 0 && (
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2 flex items-center justify-between">
                  <span>Discovered Users & Contacts</span>
                  <span className="text-blue-400 font-mono text-[10px]">{results.length} available</span>
                </p>
              )}
              {results.map((u) => (
                <div
                  key={u.id}
                  id={`user-search-item-${u.username}`}
                  className="p-3 bg-[#0f1115] hover:bg-[#2d3139] border border-[#2d3139] rounded-xl flex items-center justify-between gap-3 transition-colors shadow-2xs group"
                >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <img
                      src={u.avatar_url}
                      alt={u.display_name}
                      className="w-10 h-10 rounded-[12px] object-cover bg-[#334155] border border-[#2d3139]"
                    />
                    {u.is_online ? (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#22c55e] rounded-full ring-2 ring-[#0f1115]" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-semibold text-white truncate">{u.display_name}</h4>
                      {u.is_private ? (
                        <span className="p-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-[10px] font-medium flex items-center gap-0.5" title="Private Account">
                          <Lock className="w-2.5 h-2.5" />
                          Private
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500" title="Public Profile">
                          <Globe className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-blue-400 font-mono">@{u.username}</p>
                    {u.bio ? <p className="text-[11px] text-slate-400 truncate mt-0.5">{u.bio}</p> : null}
                  </div>
                </div>

                <button
                  id={`start-chat-with-${u.username}`}
                  onClick={() => {
                    chatEngine.saveProfile(u);
                    onSelectUserToChat(u);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors shrink-0"
                >
                  Start Chat
                </button>
              </div>
            ))}
          </>
          )}
        </div>
      </div>
    </div>
  );
};
