import React, { useState, useEffect, useRef } from 'react';
import { X, Users, Check, Search, Upload, Image as ImageIcon } from 'lucide-react';
import { Profile } from '../types';
import { firebaseAuthService } from '../services/firebaseAuthService';

interface Props {
  currentUser: Profile;
  onClose: () => void;
  onGroupCreated: (groupId: string) => void;
}

export const CreateGroupModal: React.FC<Props> = ({ currentUser, onClose, onGroupCreated }) => {
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('');
  const iconInputRef = useRef<HTMLInputElement>(null);

  const handleGroupIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setGroupIcon(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };
  const [availableUsers, setAvailableUsers] = useState<Profile[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const users = await firebaseAuthService.searchUsers('', currentUser.id);
      setAvailableUsers(users.filter((u) => u.id !== currentUser.id));
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedUserIds.length === 0) return;

    setIsLoading(true);
    try {
      const participants = [currentUser.id, ...selectedUserIds];
      const adminUids = [currentUser.id];

      const groupId = await firebaseAuthService.createGroupChat(
        groupName.trim(),
        participants,
        adminUids,
        groupIcon.trim() || undefined
      );

      onGroupCreated(groupId);
      onClose();
    } catch (err) {
      console.error('Error creating group chat:', err);
      alert('Failed to create group chat.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = availableUsers.filter((u) =>
    u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 text-white animate-fade-in">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-emerald-400" />
            <h3 className="text-lg font-bold">New Group Chat</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block font-medium">Group Subject / Name</label>
            <input
              type="text"
              required
              placeholder="e.g., Engineering Team, Project Alpha"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block font-medium">Group Icon (Internal Storage)</label>
            <div className="flex items-center gap-3">
              {groupIcon ? (
                <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-emerald-500 shrink-0">
                  <img src={groupIcon} alt="Group Icon" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setGroupIcon('')}
                    className="absolute top-0 right-0 p-0.5 bg-black/70 text-red-400 hover:text-red-300"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-500">
                  <ImageIcon size={20} />
                </div>
              )}
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Upload size={14} className="text-emerald-400" /> Choose Image from Internal Storage
              </button>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                onChange={handleGroupIconUpload}
                className="hidden"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-2 block font-medium">Select Members ({selectedUserIds.length})</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {filteredUsers.map((user) => {
                const isSelected = selectedUserIds.includes(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => toggleUserSelection(user.id)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-500/10 border border-emerald-500/40' : 'bg-slate-800/60 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.display_name}`}
                        alt={user.display_name}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div>
                        <p className="text-xs font-semibold text-slate-100">{user.display_name}</p>
                        <p className="text-[10px] text-slate-400">@{user.username}</p>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      isSelected ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-600'
                    }`}>
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !groupName.trim() || selectedUserIds.length === 0}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-md disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
