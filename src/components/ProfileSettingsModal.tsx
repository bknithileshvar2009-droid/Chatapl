import React, { useState, useEffect } from 'react';
import { Profile } from '../types';
import { chatEngine } from '../services/chatEngine';
import { firebaseAuthService } from '../services/firebaseAuthService';
import { UserSettingsModule } from './UserSettingsModule';
import { ChatWallpaperSelector } from './ChatWallpaperSelector';
import { ChatBubbleColorSelector } from './ChatBubbleColorSelector';
import { PRESET_AVATARS } from '../constants/avatars';
import { X, Lock, Globe, Camera, Check, UserCheck, LogOut, ShieldCheck, ChevronDown, ChevronUp, Key, Loader2, AlertCircle, Sliders, Upload } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: Profile | null;
  onLogout: () => void;
}

export const ProfileSettingsModal: React.FC<Props> = ({ isOpen, onClose, currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'system'>('profile');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAllAvatars, setShowAllAvatars] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAvatarUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (currentUser && isOpen) {
      setDisplayName(currentUser.display_name || '');
      setUsername(currentUser.username || '');
      setBio(currentUser.bio || '');
      setAvatarUrl(currentUser.avatar_url || '');
      setIsPrivate(currentUser.is_private || false);
      setNewPassword('');
      setErrorMsg(null);
    }
  }, [currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();

    setSaving(true);
    try {
      // Update in Firebase Auth & Firestore
      await firebaseAuthService.updateAccountSettings(currentUser.id, {
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim(),
        bio: bio.trim(),
        isSearchable: !isPrivate,
        newPassword: newPassword.trim() || undefined
      });

      chatEngine.updateProfile({
        display_name: displayName.trim(),
        username: cleanUsername,
        bio: bio.trim(),
        avatar_url: avatarUrl.trim(),
        is_private: isPrivate,
        isSearchable: !isPrivate
      });

      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="profile-settings-modal-overlay" className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div id="profile-settings-card" className="bg-[#1a1c20] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-[#2d3139] overflow-hidden text-[#f8fafc]">
        {/* Header */}
        <div id="profile-settings-header" className="px-6 py-4 bg-[#1a1c20] text-white flex items-center justify-between border-b border-[#2d3139]">
          <div id="profile-settings-title" className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Settings & Preferences</h2>
          </div>
          <button
            id="close-profile-settings-btn"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#2d3139] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div id="settings-tab-bar" className="flex border-b border-[#2d3139] bg-[#0f1115] px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'profile'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Profile Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'system'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            User Settings (Express API)
          </button>
        </div>

        {activeTab === 'system' ? (
          <div className="p-6 overflow-y-auto flex-1">
            <UserSettingsModule />
          </div>
        ) : (
          /* Scrollable Form Body */
          <form id="profile-settings-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Error Alert Box */}
          {errorMsg && (
            <div id="settings-error-alert" className="p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}
          {/* Avatar Header & Selector */}
          <div id="avatar-section" className="flex flex-col items-center space-y-3">
            <div id="avatar-preview-box" className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              <img
                id="avatar-preview-img"
                src={avatarUrl || PRESET_AVATARS[0]}
                alt="Profile Avatar"
                className="w-24 h-24 rounded-[20px] object-cover ring-2 ring-blue-500/50 shadow-lg bg-[#334155]"
              />
              <div id="avatar-camera-badge" className="absolute bottom-0 right-0 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-md transition">
                <Camera className="w-4 h-4" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-[#0f1115] hover:bg-slate-800 border border-[#2d3139] text-blue-400 hover:text-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Upload className="w-3.5 h-3.5" /> Upload Photo from Internal Storage
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFileUpload}
              className="hidden"
            />

            {/* Presets Grid */}
            <div id="preset-avatars-container" className="w-full bg-[#0f1115] border border-[#2d3139] p-3 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">Choose Profile Avatar ({PRESET_AVATARS.length} Available)</span>
                <button
                  type="button"
                  id="toggle-all-avatars-btn"
                  onClick={() => setShowAllAvatars(!showAllAvatars)}
                  className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 font-medium"
                >
                  {showAllAvatars ? (
                    <>Show Less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>View All ({PRESET_AVATARS.length}) <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              </div>

              <div
                id="preset-avatars-grid"
                className={`grid grid-cols-6 gap-2 transition-all overflow-hidden ${
                  showAllAvatars ? 'max-h-60 overflow-y-auto pr-1' : 'max-h-16'
                }`}
              >
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    id={`preset-avatar-btn-${idx}`}
                    onClick={() => setAvatarUrl(url)}
                    className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all hover:scale-110 ${
                      avatarUrl === url ? 'border-blue-500 ring-2 ring-blue-400/80 scale-105' : 'border-[#2d3139] hover:border-slate-500'
                    }`}
                  >
                    <img src={url} alt={`Avatar Preset ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gmail / Google Protection Card */}
          <div id="account-protection-card" className="p-3.5 bg-[#0f1115] border border-blue-500/30 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 border border-slate-700">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  Account Protection
                  {currentUser.is_google_protected ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Gmail Protected
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold">
                      Standard
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-400">
                  {currentUser.email ? `Linked: ${currentUser.email}` : 'Protect your chat profile with Google / Gmail Authentication'}
                </p>
              </div>
            </div>
          </div>

          {/* Display Name */}
          <div id="field-display-name" className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Display Name</label>
            <input
              id="display-name-input"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500"
              placeholder="e.g. Alex Chen"
            />
          </div>

          {/* Username */}
          <div id="field-username" className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Username (@handle)</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 text-xs font-semibold">@</span>
              <input
                id="username-input"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                className="w-full pl-7 pr-3.5 py-2 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500"
                placeholder="alex_dev"
              />
            </div>
          </div>

          {/* Bio */}
          <div id="field-bio" className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Bio / About</label>
            <textarea
              id="bio-input"
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500"
              placeholder="Hey there! I am using Nexus Chat."
            />
          </div>

          {/* Chat Background & Bubble Styling */}
          <ChatBubbleColorSelector />
          <ChatWallpaperSelector />

          {/* Change Password */}
          <div id="field-password" className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-blue-400" />
              Change Password
            </label>
            <input
              id="new-password-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-[#0f1115] text-white border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500"
              placeholder="Leave blank to keep current password"
            />
          </div>

          {/* Private Account Toggle */}
          <div id="private-account-card" className="p-4 bg-[#0f1115] border border-[#2d3139] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPrivate ? <Lock className="w-4 h-4 text-amber-400" /> : <Globe className="w-4 h-4 text-blue-400" />}
                <span className="text-xs font-semibold text-white">Private Account Mode</span>
              </div>
              <button
                id="private-account-toggle-btn"
                type="button"
                onClick={() => setIsPrivate(!isPrivate)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isPrivate ? 'bg-amber-600' : 'bg-[#2d3139]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                    isPrivate ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <p id="private-account-explanation" className="text-[11px] text-slate-400 leading-normal">
              When <strong>Private Account</strong> is turned on, your profile will be hidden from public discovery in global searches (<code>isSearchable = false</code>). Only users who search your exact <code>@{username || 'username'}</code> or already have an active chat with you can find you.
            </p>
          </div>

          {/* Submit Action */}
          <div id="profile-settings-actions" className="pt-4 flex items-center gap-3">
            <button
              id="save-profile-btn"
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSaved ? (
                <Check className="w-4 h-4" />
              ) : null}
              {saving ? 'Saving...' : isSaved ? 'Saved Successfully!' : 'Save Changes'}
            </button>
            <button
              id="logout-btn"
              type="button"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
