import React, { useState, useRef } from 'react';
import { X, Shield, ShieldAlert, UserMinus, UserPlus, Edit3, Check, Upload } from 'lucide-react';
import { Room, Profile } from '../types';
import { firebaseAuthService } from '../services/firebaseAuthService';

interface Props {
  room: Room;
  currentUser: Profile;
  onClose: () => void;
  onUpdateGroup: () => void;
}

export const GroupInfoModal: React.FC<Props> = ({ room, currentUser, onClose, onUpdateGroup }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [groupName, setGroupName] = useState(room.name || '');
  const [groupIcon, setGroupIcon] = useState(room.group_icon || '');
  const [isLoading, setIsLoading] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const adminUids = room.adminUids || (room.created_by ? [room.created_by] : []);
  const isAdmin = adminUids.includes(currentUser.id);
  const participants = room.participant_profiles || [];

  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    try {
      await firebaseAuthService.updateGroupSettings(room.id, {
        group_name: groupName,
        group_icon: groupIcon
      });
      setIsEditing(false);
      onUpdateGroup();
    } catch (err) {
      console.error('Error updating group:', err);
      alert('Failed to update group details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAdmin = async (targetUid: string) => {
    if (!isAdmin) return;
    try {
      const isCurrentlyAdmin = adminUids.includes(targetUid);
      const newAdminUids = isCurrentlyAdmin
        ? adminUids.filter((id) => id !== targetUid)
        : [...adminUids, targetUid];

      if (newAdminUids.length === 0) {
        alert('Group must have at least one admin.');
        return;
      }

      await firebaseAuthService.updateGroupAdmins(room.id, newAdminUids);
      onUpdateGroup();
    } catch (err) {
      console.error('Error toggling admin:', err);
    }
  };

  const handleRemoveMember = async (targetUid: string) => {
    if (!isAdmin) return;
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      const newParticipants = participants.map((p) => p.id).filter((id) => id !== targetUid);
      const newAdminUids = adminUids.filter((id) => id !== targetUid);

      await firebaseAuthService.updateGroupMembers(room.id, newParticipants, newAdminUids);
      onUpdateGroup();
    } catch (err) {
      console.error('Error removing member:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 text-white animate-fade-in">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <h3 className="text-lg font-bold">Group Info</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Group Header Icon & Name */}
        <div className="flex flex-col items-center text-center my-4">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-emerald-500 shadow-lg mb-3">
            <img
              src={room.group_icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${room.name}`}
              alt={room.name}
              className="w-full h-full object-cover"
            />
          </div>

          {isEditing ? (
            <div className="w-full space-y-2 mt-2">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-center text-sm font-semibold text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition"
              >
                <Upload size={13} className="text-emerald-400" /> Choose Image from Device
              </button>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                onChange={handleIconUpload}
                className="hidden"
              />
              <div className="flex justify-center gap-2 pt-1">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={isLoading}
                  className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1"
                >
                  <Check size={14} /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h4 className="text-xl font-bold text-slate-100">{room.name}</h4>
              {isAdmin && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-slate-400 hover:text-emerald-400"
                  title="Edit Group Info"
                >
                  <Edit3 size={16} />
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">{participants.length} members</p>
        </div>

        {/* Group Members & Admin Roles List */}
        <div className="mt-6">
          <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Members</h5>
          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {participants.map((member) => {
              const memberIsAdmin = adminUids.includes(member.id);
              const isSelf = member.id === currentUser.id;

              return (
                <div key={member.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/60">
                  <div className="flex items-center gap-3">
                    <img
                      src={member.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${member.display_name}`}
                      alt={member.display_name}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-200">
                          {member.display_name} {isSelf && '(You)'}
                        </span>
                        {memberIsAdmin && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-0.5">
                            <Shield size={10} /> Admin
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">@{member.username}</span>
                    </div>
                  </div>

                  {/* Admin Actions */}
                  {isAdmin && !isSelf && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleAdmin(member.id)}
                        className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                          memberIsAdmin
                            ? 'text-amber-400 hover:bg-amber-400/10'
                            : 'text-emerald-400 hover:bg-emerald-400/10'
                        }`}
                        title={memberIsAdmin ? 'Dismiss as Admin' : 'Make Group Admin'}
                      >
                        {memberIsAdmin ? <ShieldAlert size={16} /> : <UserPlus size={16} />}
                      </button>

                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Remove from Group"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
