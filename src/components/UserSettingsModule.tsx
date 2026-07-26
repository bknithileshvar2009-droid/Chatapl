import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  User,
  Moon,
  Sun,
  Monitor,
  Bell,
  BellOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Save,
  RefreshCw,
  Camera,
  Shield,
  ShieldCheck,
  Laptop,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  History,
  Clock,
  Radio,
  Sliders,
  Check
} from 'lucide-react';
import { ChatWallpaperSelector } from './ChatWallpaperSelector';
import { ChatBubbleColorSelector } from './ChatBubbleColorSelector';

export interface UserSettingsData {
  display_name: string;
  theme: 'light' | 'dark' | 'system';
  notification_enabled: boolean;
  avatar_url?: string;
  updated_at?: string;
}

export interface ActiveSession {
  id: string;
  device: string;
  ip_address: string;
  user_agent: string;
  is_current: boolean;
  last_active: string;
}

export interface SecurityLog {
  id: string;
  event: string;
  ip_address: string;
  timestamp: string;
  status: 'success' | 'warning' | 'info';
}

interface ToastMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

const STORAGE_KEYS = {
  CACHED_SETTINGS: 'nexus_user_settings_cache_v1',
  OFFLINE_QUEUE: 'nexus_offline_settings_queue_v1',
};

export const UserSettingsModule: React.FC = () => {
  // Navigation Section
  const [subSection, setSubSection] = useState<'preferences' | 'sessions' | 'security'>('preferences');

  // Form State
  const [displayName, setDisplayName] = useState<string>('Nexus User');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');
  const [notificationEnabled, setNotificationEnabled] = useState<boolean>(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('https://api.dicebear.com/7.x/bottts/svg?seed=NexusUser');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Status & Loading States
  const [fetching, setFetching] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingAvatar, setUploadingAvatar] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [hasQueuedChanges, setHasQueuedChanges] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Sessions & Security Logs State
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  /**
   * Helper to update UI state and Local Cache (Stale-While-Revalidate)
   */
  const updateLocalStateAndCache = (data: UserSettingsData) => {
    if (data.display_name !== undefined) setDisplayName(data.display_name);
    if (data.theme !== undefined) setTheme(data.theme);
    if (data.notification_enabled !== undefined) setNotificationEnabled(Boolean(data.notification_enabled));
    if (data.avatar_url) setAvatarUrl(data.avatar_url);
    if (data.updated_at) setLastSavedTime(new Date(data.updated_at).toLocaleTimeString());

    // Apply document dark/light class
    if (data.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else if (data.theme === 'dark') {
      document.documentElement.classList.add('dark');
    }

    // Cache locally
    try {
      localStorage.setItem(STORAGE_KEYS.CACHED_SETTINGS, JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage caching failed:', e);
    }
  };

  /**
   * 1. Hydrate UI immediately from Cache, then fetch fresh data from Backend API
   */
  const fetchSettings = async () => {
    setFetching(true);

    // Stale-While-Revalidate: 1. Immediately hydrate from cache
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.CACHED_SETTINGS);
      if (cached) {
        const cachedData = JSON.parse(cached);
        updateLocalStateAndCache(cachedData);
      }
    } catch (e) {
      console.warn('Failed to parse cached settings:', e);
    }

    // 2. Fetch fresh data from API asynchronously
    try {
      const response = await fetch('/api/user/settings');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.settings) {
          updateLocalStateAndCache(data.settings);
        }
      }
    } catch (err) {
      console.warn('API fetch failed or offline mode:', err);
    } finally {
      setFetching(false);
    }
  };

  /**
   * 2. Socket.io + BroadcastChannel Real-Time Synchronization
   */
  useEffect(() => {
    // Check queued changes
    const queued = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    if (queued) setHasQueuedChanges(true);

    // Initialize Socket.io connection
    try {
      const socket = io(window.location.origin, {
        reconnectionAttempts: 5,
        timeout: 5000,
      });
      socketRef.current = socket;

      socket.on('settings_updated', (updatedSettings: UserSettingsData) => {
        updateLocalStateAndCache(updatedSettings);
      });
    } catch (e) {
      console.warn('Socket.io connection initialization error:', e);
    }

    // BroadcastChannel cross-tab synchronization fallback
    try {
      const bc = new BroadcastChannel('nexus_user_settings_channel');
      broadcastChannelRef.current = bc;
      bc.onmessage = (event) => {
        if (event.data?.type === 'SETTINGS_UPDATED') {
          updateLocalStateAndCache(event.data.payload);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    // Network connectivity listeners
    const handleOnline = () => {
      setIsOffline(false);
      syncOfflineQueue();
    };

    const handleOffline = () => {
      setIsOffline(true);
      setToast({
        type: 'info',
        text: 'You are offline. Settings changes will be queued and synced automatically when reconnected.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load
    fetchSettings();
    fetchSessionsAndLogs();

    return () => {
      socketRef.current?.disconnect();
      broadcastChannelRef.current?.close();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * 3. Sync Offline Queue when internet connection is restored
   */
  const syncOfflineQueue = async () => {
    const queuedStr = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    if (!queuedStr) return;

    try {
      const queuedData: UserSettingsData = JSON.parse(queuedStr);
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queuedData),
      });

      if (response.ok) {
        localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
        setHasQueuedChanges(false);
        setToast({
          type: 'success',
          text: 'Restored connection! Offline queued settings synced successfully.',
        });
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      console.error('Failed to sync offline queue:', err);
    }
  };

  /**
   * 4. Fetch Active Sessions & Security Logs
   */
  const fetchSessionsAndLogs = async () => {
    setLoadingSessions(true);
    try {
      const [resSess, resLogs] = await Promise.all([
        fetch('/api/settings/sessions'),
        fetch('/api/settings/logs'),
      ]);

      if (resSess.ok) {
        const data = await resSess.json();
        if (data.success && Array.isArray(data.sessions)) setSessions(data.sessions);
      }

      if (resLogs.ok) {
        const data = await resLogs.json();
        if (data.success && Array.isArray(data.logs)) setLogs(data.logs);
      }
    } catch (err) {
      console.warn('Error fetching sessions/logs:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  /**
   * 5. Terminate Active Session
   */
  const handleTerminateSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/settings/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setSessions(data.sessions || sessions.filter((s) => s.id !== sessionId));
        setToast({
          type: 'success',
          text: data.message || 'Session terminated successfully.',
        });
        fetchSessionsAndLogs();
      } else {
        setToast({
          type: 'error',
          text: data.error || 'Failed to terminate session.',
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err.message || 'Network error while terminating session.',
      });
    }
  };

  /**
   * 6. Avatar File Upload Handler (POST /api/settings/avatar)
   */
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Instant client-side preview via URL.createObjectURL
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setUploadingAvatar(true);

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch('/api/settings/avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const newUrl = data.url;
        setAvatarUrl(newUrl);
        setAvatarPreview(null);
        setToast({
          type: 'success',
          text: 'Profile avatar uploaded and updated successfully!',
        });

        // Broadcast across tabs
        broadcastChannelRef.current?.postMessage({
          type: 'SETTINGS_UPDATED',
          payload: { avatar_url: newUrl },
        });

        fetchSessionsAndLogs();
      } else {
        throw new Error(data.error || 'Avatar upload failed.');
      }
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setToast({
        type: 'error',
        text: err.message || 'Failed to upload avatar image.',
      });
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  /**
   * 7. Handle Settings Form Submit (POST /api/user/settings)
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setToast(null);

    if (!displayName.trim()) {
      setToast({ type: 'error', text: 'Display Name cannot be empty.' });
      setSubmitting(false);
      return;
    }

    const payload: UserSettingsData = {
      display_name: displayName.trim(),
      theme,
      notification_enabled: notificationEnabled,
      avatar_url: avatarUrl,
    };

    // If offline, save to local queue
    if (!navigator.onLine) {
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(payload));
      setHasQueuedChanges(true);
      updateLocalStateAndCache(payload);
      setToast({
        type: 'info',
        text: 'Offline mode: Settings saved to local queue. They will sync automatically once reconnected.',
      });
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        updateLocalStateAndCache(data.settings);
        setToast({
          type: 'success',
          text: data.message || 'User settings updated successfully!',
        });

        // Broadcast cross-tab
        broadcastChannelRef.current?.postMessage({
          type: 'SETTINGS_UPDATED',
          payload: data.settings,
        });

        fetchSessionsAndLogs();
        setTimeout(() => setToast(null), 4000);
      } else {
        const errorMsg = data.details ? data.details.join(' ') : (data.error || 'Failed to save settings.');
        setToast({ type: 'error', text: errorMsg });
      }
    } catch (err: any) {
      // Fallback offline queue
      localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(payload));
      setHasQueuedChanges(true);
      updateLocalStateAndCache(payload);
      setToast({
        type: 'info',
        text: 'Network failed. Settings queued locally and will auto-sync when online.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="user-settings-module" className="bg-[#1a1c20] text-slate-100 rounded-2xl border border-[#2d3139] shadow-xl max-w-xl mx-auto overflow-hidden">
      {/* Module Header */}
      <div className="p-5 bg-[#0f1115] border-b border-[#2d3139] flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-500" />
            User Preferences & Settings API
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full-stack Express + Socket.io + Multer + Offline Sync Queue
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Offline/Online Status Badge */}
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
            isOffline ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
          }`}>
            {isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
            {isOffline ? 'Offline' : 'Live Sync'}
          </div>

          <button
            type="button"
            onClick={fetchSettings}
            disabled={fetching}
            title="Refresh Settings from API"
            className="p-2 bg-[#1a1c20] hover:bg-[#282c35] text-slate-300 rounded-xl transition-colors border border-[#2d3139] text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-Section Navigation */}
      <div className="flex border-b border-[#2d3139] bg-[#14161a] px-5">
        <button
          type="button"
          onClick={() => setSubSection('preferences')}
          className={`py-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            subSection === 'preferences'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          Preferences & Avatar
        </button>

        <button
          type="button"
          onClick={() => setSubSection('sessions')}
          className={`py-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            subSection === 'sessions'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          Active Sessions ({sessions.length})
        </button>

        <button
          type="button"
          onClick={() => setSubSection('security')}
          className={`py-3 px-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            subSection === 'security'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Security Audit Log
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Toast Notification Banner */}
        {toast && (
          <div
            id="settings-toast-banner"
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 transition-all animate-in fade-in duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : toast.type === 'info'
                ? 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : toast.type === 'info' ? (
              <Radio className="w-4 h-4 text-blue-400 shrink-0 mt-0.5 animate-pulse" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium leading-relaxed">{toast.text}</div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white text-xs font-bold px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Queued Offline Banner */}
        {hasQueuedChanges && (
          <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-300 text-xs flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              Pending offline changes in queue. Will auto-sync when online.
            </span>
            <button
              type="button"
              onClick={syncOfflineQueue}
              className="px-2.5 py-1 bg-amber-500 text-black font-bold rounded-lg text-[11px] hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Sync Now
            </button>
          </div>
        )}

        {/* TAB 1: PREFERENCES & AVATAR UPLOAD */}
        {subSection === 'preferences' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Upload Container */}
            <div className="p-4 bg-[#0f1115] border border-[#2d3139] rounded-2xl flex flex-col sm:flex-row items-center gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-blue-500/50 group cursor-pointer shrink-0 bg-slate-800"
              >
                <img
                  src={avatarPreview || avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-semibold gap-1">
                  <Camera className="w-4 h-4 text-blue-400" />
                  <span>Change Avatar</span>
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  </div>
                )}
              </div>

              {/* Hidden File Input for Multer */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileSelect}
                className="hidden"
              />

              <div className="space-y-1 text-center sm:text-left flex-1">
                <h3 className="text-xs font-bold text-white flex items-center justify-center sm:justify-start gap-1.5">
                  User Avatar Picture
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    Multer POST /api/settings/avatar
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Click avatar to upload a new image. Automatically processed, compressed, and synchronized across tabs.
                </p>
              </div>
            </div>

            {/* 1. Display Name Input */}
            <div className="space-y-2">
              <label htmlFor="display-name-input" className="block text-xs font-semibold text-slate-200">
                Display Name
              </label>
              <div className="relative">
                <input
                  id="display-name-input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  maxLength={50}
                  required
                  className="w-full px-4 py-2.5 bg-[#0f1115] text-white text-xs border border-[#2d3139] rounded-xl focus:outline-none focus:border-blue-500 transition-colors pl-10"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-400">
                Visible across chats and profile directories (Max 50 chars).
              </p>
            </div>

            {/* 2. Theme Selection Dropdown */}
            <div className="space-y-2">
              <label htmlFor="theme-select" className="block text-xs font-semibold text-slate-200">
                Theme Selection
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-xs'
                      : 'bg-[#0f1115] border-[#2d3139] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  Dark
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    theme === 'light'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-xs'
                      : 'bg-[#0f1115] border-[#2d3139] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  Light
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    theme === 'system'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-xs'
                      : 'bg-[#0f1115] border-[#2d3139] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  System
                </button>
              </div>
            </div>

            {/* Chat Bubble & Background Styling */}
            <ChatBubbleColorSelector />
            <ChatWallpaperSelector />

            {/* 3. Notification Checkbox Toggle */}
            <div className="p-4 bg-[#0f1115] border border-[#2d3139] rounded-xl flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  {notificationEnabled ? (
                    <Bell className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <BellOff className="w-4 h-4 text-slate-500" />
                  )}
                  Enable System Notifications
                </div>
                <p className="text-[11px] text-slate-400">
                  Receive audio chimes and desktop alerts for incoming messages.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                <input
                  type="checkbox"
                  checked={notificationEnabled}
                  onChange={(e) => setNotificationEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-[#282c35] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Action Footer */}
            <div className="pt-2 flex items-center justify-between border-t border-[#2d3139]">
              <span className="text-[11px] text-slate-500">
                {lastSavedTime ? `Last synced at ${lastSavedTime}` : 'Not synced yet'}
              </span>

              <button
                id="save-settings-btn"
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {submitting ? 'Saving to API...' : 'Save Preferences'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: ACTIVE SESSIONS TRACKER */}
        {subSection === 'sessions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Laptop className="w-4 h-4 text-blue-400" />
                  Active Device Sessions
                </h3>
                <p className="text-[11px] text-slate-400">
                  Logged in devices with active access tokens (GET /api/settings/sessions).
                </p>
              </div>
              <button
                type="button"
                onClick={fetchSessionsAndLogs}
                disabled={loadingSessions}
                className="text-xs text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingSessions ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="space-y-2.5">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3.5 bg-[#0f1115] border border-[#2d3139] rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      {sess.device.toLowerCase().includes('mobile') || sess.device.toLowerCase().includes('ios') ? (
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Laptop className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-white truncate">{sess.device}</p>
                        {sess.is_current && (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full">
                            Current Device
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        IP: {sess.ip_address} • Last active {new Date(sess.last_active).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  {!sess.is_current && (
                    <button
                      type="button"
                      onClick={() => handleTerminateSession(sess.id)}
                      className="p-2 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-rose-500/30 text-xs flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Terminate session remotely (DELETE /api/settings/sessions/:id)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Terminate</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SECURITY ACTIVITY AUDIT LOG */}
        {subSection === 'security' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Security Activity Log
                </h3>
                <p className="text-[11px] text-slate-400">
                  Recorded security events & authentication changes (GET /api/settings/logs).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-[#0f1115] border border-[#2d3139] rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        log.status === 'success'
                          ? 'bg-emerald-400 shadow-emerald-500/50'
                          : log.status === 'warning'
                          ? 'bg-amber-400 shadow-amber-500/50'
                          : 'bg-blue-400 shadow-blue-500/50'
                      }`}
                    />
                    <div>
                      <p className="font-semibold text-white">{log.event}</p>
                      <p className="text-[10px] text-slate-400">IP: {log.ip_address}</p>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

