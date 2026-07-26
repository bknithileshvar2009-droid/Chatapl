import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, X, Eye, Image as ImageIcon, Send, ChevronLeft, ChevronRight,
  Upload, Music, Sliders, Sparkles, Volume2, VolumeX, Play, Pause,
  Wand2, Type, Check, RefreshCw, FolderUp, Flame, Radio, Award, Disc
} from 'lucide-react';
import { Profile, UserStatusStory } from '../types';
import { statusStoryService } from '../services/statusStoryService';
import { VIJAY_MUSIC_CATALOG, VijayTrack, playVijayTrackLiveSynth, stopVijayTrackLiveSynth } from '../utils/vijayMusicSynth';

interface Props {
  currentUser: Profile;
  isFullTab?: boolean;
}

export type TamilMusicTrack = VijayTrack;

const TAMIL_MUSIC_CATALOG: TamilMusicTrack[] = VIJAY_MUSIC_CATALOG;

const FILTER_PRESETS = [
  { id: 'normal', name: 'Original', filter: 'none' },
  { id: 'vintage', name: 'Vintage', filter: 'sepia(0.6) contrast(1.1) brightness(0.95)' },
  { id: 'bw', name: 'B & W', filter: 'grayscale(1) contrast(1.2)' },
  { id: 'cyber', name: 'Cyberpunk', filter: 'hue-rotate(180deg) saturate(1.8) contrast(1.1)' },
  { id: 'warm', name: 'Warm Sunset', filter: 'sepia(0.3) saturate(1.4) brightness(1.05)' },
  { id: 'contrast', name: 'Vibrant', filter: 'contrast(1.3) saturate(1.5)' },
  { id: 'blur', name: 'Soft Dream', filter: 'blur(1px) brightness(1.1) saturate(1.2)' },
];

export const StatusStoriesBar: React.FC<Props> = ({ currentUser, isFullTab = false }) => {
  const [statuses, setStatuses] = useState<UserStatusStory[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState<UserStatusStory[] | null>(null);
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);

  // New Story Form state
  const [storyType, setStoryType] = useState<'text' | 'image'>('image');
  const [storyCaption, setStoryCaption] = useState('');
  const [storyMediaUrl, setStoryMediaUrl] = useState('');
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [storyBgColor, setStoryBgColor] = useState('#0f172a');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Music state
  const [selectedMusicCategory, setSelectedMusicCategory] = useState<string>('All');
  const [selectedMusic, setSelectedMusic] = useState<TamilMusicTrack>(TAMIL_MUSIC_CATALOG[1]); // Default Naa Ready
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Viewer Audio state
  const viewerAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isViewerAudioMuted, setIsViewerAudioMuted] = useState(false);

  // Image Editor State
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('normal');
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [overlayText, setOverlayText] = useState('');
  const [overlayColor, setOverlayColor] = useState('#10b981');

  const BG_COLORS = ['#0f172a', '#1e293b', '#064e3b', '#4c1d95', '#831843', '#78350f'];

  useEffect(() => {
    const unsub = statusStoryService.subscribeToActiveStatuses((updatedList) => {
      setStatuses(updatedList);
    });
    statusStoryService.cleanupExpiredStatuses();
    return () => unsub();
  }, []);

  // Sync music playback in Viewer
  useEffect(() => {
    if (activeStoryGroup && activeStoryGroup[activeStoryIdx]) {
      const story = activeStoryGroup[activeStoryIdx];
      if (story.musicUrl) {
        if (viewerAudioRef.current) {
          viewerAudioRef.current.pause();
        }
        const audio = new Audio(story.musicUrl);
        audio.onerror = () => {
          // Silently handle media load error if track fails
        };
        audio.loop = true;
        audio.muted = isViewerAudioMuted;
        audio.play().catch(() => {});
        viewerAudioRef.current = audio;
      } else if (viewerAudioRef.current) {
        viewerAudioRef.current.pause();
        viewerAudioRef.current = null;
      }
    } else if (viewerAudioRef.current) {
      viewerAudioRef.current.pause();
      viewerAudioRef.current = null;
    }

    return () => {
      if (viewerAudioRef.current) {
        viewerAudioRef.current.pause();
      }
    };
  }, [activeStoryGroup, activeStoryIdx, isViewerAudioMuted]);

  // Handle music preview in creator modal
  const handleTogglePreviewTrack = (track: TamilMusicTrack) => {
    if (!track.url && !track.id) return;
    if (previewTrackId === track.id) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      stopVijayTrackLiveSynth();
      setPreviewTrackId(null);
    } else {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      stopVijayTrackLiveSynth();
      if (track.url) {
        const audio = new Audio(track.url);
        audio.onerror = () => {};
        audio.play().catch(() => {});
        previewAudioRef.current = audio;
      }
      playVijayTrackLiveSynth(track.id);
      setPreviewTrackId(track.id);
    }
  };

  // Group stories by userId
  const groupedStatuses: { [userId: string]: UserStatusStory[] } = {};
  statuses.forEach((st) => {
    if (!groupedStatuses[st.userId]) groupedStatuses[st.userId] = [];
    groupedStatuses[st.userId].push(st);
  });

  const myStatuses = groupedStatuses[currentUser.id] || [];

  const handleOpenViewer = (userStories: UserStatusStory[]) => {
    setActiveStoryGroup(userStories);
    setActiveStoryIdx(0);
    if (userStories.length > 0) {
      statusStoryService.markStatusAsViewed(userStories[0].id, currentUser.id);
    }
  };

  const handleNextStory = () => {
    if (!activeStoryGroup) return;
    if (activeStoryIdx < activeStoryGroup.length - 1) {
      const nextIdx = activeStoryIdx + 1;
      setActiveStoryIdx(nextIdx);
      statusStoryService.markStatusAsViewed(activeStoryGroup[nextIdx].id, currentUser.id);
    } else {
      setActiveStoryGroup(null);
    }
  };

  const handlePrevStory = () => {
    if (activeStoryIdx > 0) {
      setActiveStoryIdx((prev) => prev - 1);
    }
  };

  // Internal Local Storage File Upload handler
  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setStoryType('image');
      setRawImageSrc(dataUrl);
      setStoryMediaUrl(dataUrl);
      setShowImageEditor(true);
    };
    reader.readAsDataURL(file);
  };

  // Custom Audio Track File Upload handler
  const handleAudioTrackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const customTrack: TamilMusicTrack = {
        id: `custom-${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'My Upload',
        views: 'Custom Audio',
        category: 'Custom',
        url: dataUrl
      };
      setSelectedMusic(customTrack);
    };
    reader.readAsDataURL(file);
  };

  // In-App Image Editing Canvas Processor
  const applyImageEdits = () => {
    if (!rawImageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = rawImageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 800;
      canvas.height = img.height || 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Apply Filter Effects & Adjustments
      const preset = FILTER_PRESETS.find((f) => f.id === selectedFilter);
      let filterCss = `brightness(${brightness}%) contrast(${contrast}%)`;
      if (preset && preset.filter !== 'none') {
        filterCss += ` ${preset.filter}`;
      }
      ctx.filter = filterCss;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Reset filter for text watermark overlay
      ctx.filter = 'none';
      if (overlayText.trim()) {
        const fontSize = Math.max(24, Math.floor(canvas.width / 20));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = overlayColor;
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.textAlign = 'center';
        ctx.fillText(overlayText, canvas.width / 2, canvas.height - fontSize * 1.5);
      }

      const editedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setStoryMediaUrl(editedDataUrl);
      setShowImageEditor(false);
    };
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyCaption && !storyMediaUrl) return;
    setIsSubmitting(true);
    try {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPreviewTrackId(null);
      }

      await statusStoryService.createStatus(
        currentUser.id,
        currentUser.display_name,
        currentUser.avatar_url,
        storyType,
        storyType === 'image' ? storyMediaUrl : undefined,
        storyCaption,
        storyBgColor,
        selectedMusic.url ? selectedMusic.title : undefined,
        selectedMusic.url ? `${selectedMusic.artist} (${selectedMusic.views})` : undefined,
        selectedMusic.url || undefined,
        storyType === 'image' ? 'internal-storage/status-media' : undefined
      );
      setShowCreateModal(false);
      setStoryCaption('');
      setStoryMediaUrl('');
      setRawImageSrc(null);
    } catch (err) {
      console.error('Failed to post status:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredMusicCatalog = TAMIL_MUSIC_CATALOG.filter((t) => {
    if (selectedMusicCategory === 'All') return true;
    return t.category.includes(selectedMusicCategory);
  });

  // Render Full Workspace Tab View
  if (isFullTab) {
    return (
      <div className="flex-1 w-full bg-slate-950 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Full Tab Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 font-extrabold text-[11px] rounded-full border border-emerald-500/30 flex items-center gap-1">
                <Sparkles size={12} /> Status & Story Workspace Tab
              </span>
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 font-extrabold text-[11px] rounded-full border border-amber-500/30 flex items-center gap-1">
                <Disc size={12} /> Multi-Million Tamil Music
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Status Upload & Tamil Photo Music Studio
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Create and share 24-hour status updates attached with blockbuster Tamil soundtrack hits (Anirudh, A.R. Rahman, Yuvan, Sai Abhyankkar) and custom image filters.
            </p>
          </div>

          {/* Prominent Upload Status Button */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              onClick={() => {
                setStoryType('image');
                setShowCreateModal(true);
              }}
              className="flex-1 md:flex-none px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span>Upload Photo Status</span>
            </button>
            <button
              onClick={() => {
                setStoryType('text');
                setShowCreateModal(true);
              }}
              className="flex-1 md:flex-none px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm rounded-2xl border border-slate-700 transition flex items-center justify-center gap-2"
            >
              <Type className="w-4 h-4 text-emerald-400" />
              <span>Text Story</span>
            </button>
          </div>
        </div>

        {/* Workspace Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* My Status & Quick Actions */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" /> My Status Stories
            </h2>

            <div 
              onClick={() => {
                if (myStatuses.length > 0) handleOpenViewer(myStatuses);
                else setShowCreateModal(true);
              }}
              className="p-4 bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-2xl cursor-pointer transition flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-full p-0.5 border-2 border-emerald-500 shadow-md">
                  <img 
                    src={currentUser.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.display_name}`} 
                    alt={currentUser.display_name} 
                    className="w-full h-full object-cover rounded-full"
                  />
                  <div className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center font-bold text-xs shadow-md">
                    +
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition">My Status</h3>
                  <p className="text-xs text-slate-400">
                    {myStatuses.length > 0 ? `${myStatuses.length} active updates` : 'Tap to add 24-hr status'}
                  </p>
                </div>
              </div>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreateModal(true);
                }}
                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold text-xs rounded-xl border border-emerald-500/30"
              >
                Upload Status
              </button>
            </div>

            {/* Featured Tamil Hit Soundtracks Banner */}
            <div className="p-4 bg-gradient-to-br from-emerald-950/60 to-slate-950 border border-emerald-500/30 rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                <span className="flex items-center gap-1.5"><Disc className="w-4 h-4" /> Multi-Million Tamil Music</span>
                <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full">12 Tracks</span>
              </div>
              <p className="text-xs text-slate-300">
                Attach Tamil blockbuster audio clips (Leo, Jailer, Beast, Maari 2) directly to your status photo edits!
              </p>
              <button
                onClick={() => {
                  setStoryType('image');
                  setShowCreateModal(true);
                }}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
              >
                <Music className="w-3.5 h-3.5" /> Edit Photo with Tamil Tracks
              </button>
            </div>
          </div>

          {/* Contact Status Updates Grid */}
          <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" /> Recent Contact Updates
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                {Object.keys(groupedStatuses).filter(u => u !== currentUser.id).length} contacts posted
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.keys(groupedStatuses).map((uId) => {
                if (uId === currentUser.id) return null;
                const userStories = groupedStatuses[uId];
                const firstStory = userStories[0];
                const hasUnviewed = userStories.some((s) => !s.viewers.includes(currentUser.id));

                return (
                  <div
                    key={uId}
                    onClick={() => handleOpenViewer(userStories)}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-2xl cursor-pointer transition flex flex-col items-center text-center gap-2 group relative overflow-hidden"
                  >
                    <div className={`w-14 h-14 rounded-full p-0.5 border-2 transition-all ${
                      hasUnviewed ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-slate-700 opacity-80'
                    }`}>
                      <img 
                        src={firstStory.userAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${firstStory.userName}`} 
                        alt={firstStory.userName} 
                        className="w-full h-full object-cover rounded-full"
                      />
                    </div>
                    <div className="min-w-0 w-full">
                      <h4 className="text-xs font-bold text-slate-200 truncate group-hover:text-emerald-400 transition">
                        {firstStory.userName}
                      </h4>
                      <p className="text-[10px] text-slate-400 truncate">
                        {userStories.length} {userStories.length === 1 ? 'story' : 'stories'}
                      </p>
                    </div>
                    {firstStory.musicTitle && (
                      <div className="text-[9px] text-emerald-400 font-mono bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/30 truncate w-full">
                        🎵 {firstStory.musicTitle}
                      </div>
                    )}
                  </div>
                );
              })}

              {Object.keys(groupedStatuses).filter(u => u !== currentUser.id).length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                  No contact status updates yet. Be the first to upload a status!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal renderers */}
        {renderCreateModal()}
        {renderViewerModal()}
      </div>
    );
  }

  // Render Compact Top Header Bar Mode (when in Chat view)
  return (
    <div className="w-full bg-slate-900 border-b border-slate-800 p-3 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-4 min-w-max">
        {/* My Status Item */}
        <div className="flex flex-col items-center gap-1 cursor-pointer group" onClick={() => {
          if (myStatuses.length > 0) handleOpenViewer(myStatuses);
          else setShowCreateModal(true);
        }}>
          <div className="relative w-14 h-14 rounded-full p-0.5 border-2 border-slate-700 group-hover:border-emerald-500 transition-colors">
            <img 
              src={currentUser.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.display_name}`} 
              alt={currentUser.display_name} 
              className="w-full h-full object-cover rounded-full"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCreateModal(true);
              }}
              className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-full flex items-center justify-center font-bold text-xs shadow-md"
              title="Add Status"
            >
              <Plus size={14} />
            </button>
          </div>
          <span className="text-[11px] font-medium text-slate-300">My Status</span>
        </div>

        {/* Contact Status Items */}
        {Object.keys(groupedStatuses).map((uId) => {
          if (uId === currentUser.id) return null;
          const userStories = groupedStatuses[uId];
          const firstStory = userStories[0];
          const hasUnviewed = userStories.some((s) => !s.viewers.includes(currentUser.id));

          return (
            <div
              key={uId}
              onClick={() => handleOpenViewer(userStories)}
              className="flex flex-col items-center gap-1 cursor-pointer group"
            >
              <div className={`w-14 h-14 rounded-full p-0.5 border-2 transition-all ${
                hasUnviewed ? 'border-emerald-500 shadow-sm shadow-emerald-500/20' : 'border-slate-700 opacity-80'
              }`}>
                <img 
                  src={firstStory.userAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${firstStory.userName}`} 
                  alt={firstStory.userName} 
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <span className="text-[11px] font-medium text-slate-300 max-w-[64px] truncate">
                {firstStory.userName}
              </span>
            </div>
          );
        })}
      </div>

      {renderCreateModal()}
      {renderViewerModal()}
    </div>
  );

  // Helper renderers for modals
  function renderCreateModal() {
    if (!showCreateModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Upload 24-Hour Status Story</h3>
                <p className="text-xs text-slate-400">Edit photo, add filters & attach multi-million Tamil music</p>
              </div>
            </div>
            <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {/* Type Switcher */}
            <div className="flex gap-2 p-1 bg-slate-950 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setStoryType('image')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
                  storyType === 'image' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                📸 Image / Photo Editor
              </button>
              <button
                type="button"
                onClick={() => setStoryType('text')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
                  storyType === 'text' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                ✍️ Text Card
              </button>
            </div>

            {/* Text Card Background Color Selector */}
            {storyType === 'text' && (
              <div>
                <label className="text-xs font-bold text-slate-300 mb-2 block">Background Color</label>
                <div className="flex gap-2 mb-2">
                  {BG_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setStoryBgColor(c)}
                      className={`w-9 h-9 rounded-full border-2 transition transform active:scale-90 ${
                        storyBgColor === c ? 'border-emerald-400 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Image / Internal Storage Upload Section */}
            {storyType === 'image' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition">
                    <FolderUp className="w-4 h-4 text-emerald-400" />
                    <span>Upload Photo from Internal Storage</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleLocalFileUpload} 
                      className="hidden" 
                    />
                  </label>

                  {rawImageSrc && (
                    <button
                      type="button"
                      onClick={() => setShowImageEditor(true)}
                      className="py-2.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl flex items-center gap-1.5 text-xs font-bold transition"
                    >
                      <Wand2 className="w-4 h-4" /> Edit Photo
                    </button>
                  )}
                </div>

                {/* Image Preview Thumbnail */}
                {storyMediaUrl && (
                  <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center group">
                    <img src={storyMediaUrl} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowImageEditor(true)}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1"
                      >
                        <Wand2 className="w-3.5 h-3.5" /> Edit Photo Filters & Sticker
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* In-App Image Editor Sub-Modal */}
            {showImageEditor && rawImageSrc && (
              <div className="p-4 bg-slate-950 border border-emerald-500/40 rounded-2xl space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <Wand2 className="w-4 h-4" /> Photo Filter & Sticker Studio
                  </span>
                  <button type="button" onClick={() => setShowImageEditor(false)} className="text-slate-400 hover:text-white">
                    <X size={16} />
                  </button>
                </div>

                {/* Filter Presets */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 mb-1 block">Color Filter Presets</label>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {FILTER_PRESETS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setSelectedFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 ${
                          selectedFilter === f.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Brightness: {brightness}%</label>
                    <input 
                      type="range" 
                      min="50" 
                      max="150" 
                      value={brightness} 
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-emerald-500" 
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Contrast: {contrast}%</label>
                    <input 
                      type="range" 
                      min="50" 
                      max="150" 
                      value={contrast} 
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-emerald-500" 
                    />
                  </div>
                </div>

                {/* Text Overlay Input */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 mb-1 block">Text Overlay Sticker</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add sticker text..."
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 text-white text-xs px-3 py-1.5 rounded-xl focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="color"
                      value={overlayColor}
                      onChange={(e) => setOverlayColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={applyImageEdits}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Check className="w-4 h-4" /> Apply Edits to Story Photo
                </button>
              </div>
            )}

            {/* Thalapathy Vijay Hit Songs Music Catalog Selector */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Disc className="w-4 h-4 text-emerald-400" /> Thalapathy Vijay Hit Songs Studio
                </label>
                {selectedMusic.url && (
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">
                    🎵 {selectedMusic.title} ({selectedMusic.views})
                  </span>
                )}
              </div>

              {/* Category Filter Chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px] font-bold">
                {['All', 'Leo Hits', 'GOAT Hits', 'Master Hits', 'Beast Hits', 'Varisu Hits', 'Bigil Hits', 'Mersal Hits', 'Classic Mass'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedMusicCategory(cat)}
                    className={`px-2.5 py-1 rounded-full transition shrink-0 ${
                      selectedMusicCategory === cat
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat === 'All' ? '🔥 All Vijay Songs' : cat}
                  </button>
                ))}
              </div>

              {/* Music List */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                {filteredMusicCatalog.map((track) => (
                  <div
                    key={track.id}
                    className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between ${
                      selectedMusic.id === track.id 
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200' 
                        : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div 
                      onClick={() => setSelectedMusic(track)}
                      className="flex-1 cursor-pointer min-w-0 pr-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{track.title}</span>
                        {track.movie && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded font-medium shrink-0">
                            {track.movie}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span className="truncate">{track.artist}</span>
                        <span className="text-amber-400 font-mono shrink-0 font-bold">{track.views}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {track.url && (
                        <button
                          type="button"
                          onClick={() => handleTogglePreviewTrack(track)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg transition"
                          title="Preview track audio"
                        >
                          {previewTrackId === track.id ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedMusic(track)}
                        className={`p-1.5 rounded-lg text-xs font-bold transition ${
                          selectedMusic.id === track.id
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {selectedMusic.id === track.id ? <Check size={14} /> : 'Select'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload Custom Audio Track */}
              <label className="cursor-pointer py-2 px-3 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-bold transition mt-2">
                <span className="flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" /> Upload Custom Music Track
                </span>
                <input type="file" accept="audio/*" onChange={handleAudioTrackUpload} className="hidden" />
              </label>
            </div>

            {/* Caption Input */}
            <div>
              <label className="text-xs font-bold text-slate-300 mb-1 block">Caption / Message</label>
              <textarea
                rows={2}
                placeholder="What's on your mind?..."
                value={storyCaption}
                onChange={(e) => setStoryCaption(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none font-medium"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-lg transition active:scale-95"
              >
                <Send size={14} /> Post Story
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderViewerModal() {
    if (!activeStoryGroup) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 animate-fade-in">
        <div className="relative w-full max-w-sm h-[85vh] max-h-[650px] rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between p-4" style={{ backgroundColor: activeStoryGroup[activeStoryIdx].bgColor || '#0f172a' }}>
          {/* Header & Progress Timers */}
          <div className="z-10 flex flex-col gap-3">
            <div className="flex gap-1">
              {activeStoryGroup.map((s, idx) => (
                <div key={s.id} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-white transition-all ${
                      idx < activeStoryIdx ? 'w-full' : idx === activeStoryIdx ? 'w-full animate-progress' : 'w-0'
                    }`}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <img 
                  src={activeStoryGroup[activeStoryIdx].userAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${activeStoryGroup[activeStoryIdx].userName}`} 
                  alt="avatar" 
                  className="w-8 h-8 rounded-full object-cover border border-white/20"
                />
                <div>
                  <h5 className="font-bold text-xs">{activeStoryGroup[activeStoryIdx].userName}</h5>
                  <p className="text-[10px] opacity-70">
                    {new Date(activeStoryGroup[activeStoryIdx].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeStoryGroup[activeStoryIdx].musicUrl && (
                  <button
                    onClick={() => setIsViewerAudioMuted(!isViewerAudioMuted)}
                    className="p-1.5 bg-black/40 hover:bg-black/60 text-emerald-400 rounded-full flex items-center gap-1 text-[10px] px-2 font-mono"
                    title="Toggle background music"
                  >
                    {isViewerAudioMuted ? <VolumeX size={14} /> : <Volume2 size={14} className="animate-pulse" />}
                    <span className="truncate max-w-[80px]">{activeStoryGroup[activeStoryIdx].musicTitle}</span>
                  </button>
                )}

                <button onClick={() => setActiveStoryGroup(null)} className="p-1 hover:bg-white/10 rounded-full">
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Story Content Area */}
          <div className="flex-1 flex flex-col items-center justify-center my-4 overflow-hidden relative">
            {activeStoryGroup[activeStoryIdx].mediaUrl && (
              <img 
                src={activeStoryGroup[activeStoryIdx].mediaUrl} 
                alt="Story" 
                className="max-h-[70%] max-w-full object-contain rounded-2xl shadow-xl mb-4"
              />
            )}
            {activeStoryGroup[activeStoryIdx].caption && (
              <p className="text-white font-medium text-center text-lg px-4 drop-shadow-md">
                {activeStoryGroup[activeStoryIdx].caption}
              </p>
            )}

            <button 
              onClick={handlePrevStory} 
              className="absolute left-0 inset-y-0 w-1/3 flex items-center justify-start pl-2 text-white/40 hover:text-white"
            >
              <ChevronLeft size={28} />
            </button>
            <button 
              onClick={handleNextStory} 
              className="absolute right-0 inset-y-0 w-1/3 flex items-center justify-end pr-2 text-white/40 hover:text-white"
            >
              <ChevronRight size={28} />
            </button>
          </div>

          {/* Viewer Count Footer */}
          <div className="z-10 flex items-center justify-between px-3 py-1 bg-black/30 backdrop-blur-md rounded-full text-xs text-white/80">
            <div className="flex items-center gap-1.5">
              <Eye size={14} />
              <span>{activeStoryGroup[activeStoryIdx].viewers.length} views</span>
            </div>
            {activeStoryGroup[activeStoryIdx].storagePath && (
              <span className="text-[10px] text-emerald-400 font-mono">
                Internal Storage
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
};

