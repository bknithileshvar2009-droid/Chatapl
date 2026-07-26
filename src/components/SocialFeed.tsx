import React, { useState, useEffect, useRef } from 'react';
import { SocialPost, Profile, CreatorAnalytics } from '../types';
import { 
  Heart, MessageCircle, Share2, DollarSign, Lock, Sparkles, 
  PlusSquare, BarChart3, TrendingUp, Users, Award, CheckCircle2, X, Send, Eye,
  Film, Play, Pause, Music, Volume2, VolumeX, Flame, Upload
} from 'lucide-react';

interface Props {
  currentUser: Profile | null;
}

const INITIAL_POSTS: SocialPost[] = [
  {
    id: 'reel-1',
    userId: 'usr-sarah',
    userName: 'Sarah Lin',
    userAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Sarah',
    isVipCreator: true,
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    mediaType: 'video',
    caption: '🚀 60-second tutorial: Building WebRTC data channels with zero server latency!',
    tags: ['#Reels', '#Coding', '#WebRTC', '#TechTips'],
    likesCount: 389,
    commentsCount: 42,
    isLiked: true,
    isExclusive: false,
    tipsEarned: 85,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    aiCategory: 'Reels',
    aiEngagementScore: 99
  },
  {
    id: 'post-1',
    userId: 'usr-alex',
    userName: 'Alex Rivera',
    userAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Alex',
    isVipCreator: true,
    mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
    mediaType: 'image',
    caption: 'Building the next generation of real-time E2EE communication tech! ⚡',
    tags: ['#ApexMobile', '#Tech', '#E2EE', '#Future'],
    likesCount: 142,
    commentsCount: 28,
    isLiked: false,
    isExclusive: false,
    tipsEarned: 45,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    aiCategory: 'Technology',
    aiEngagementScore: 98
  },
  {
    id: 'reel-2',
    userId: 'usr-devon',
    userName: 'Devon Vance',
    userAvatar: 'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Devon',
    isVipCreator: true,
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    mediaType: 'video',
    caption: 'Neon dark-mode UI design process in 15 seconds! 🔥',
    tags: ['#UIRecord', '#DesignReels', '#Figma', '#Apex'],
    likesCount: 512,
    commentsCount: 61,
    isLiked: false,
    isExclusive: false,
    tipsEarned: 140,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    aiCategory: 'Reels',
    aiEngagementScore: 96
  },
  {
    id: 'post-2',
    userId: 'usr-elena',
    userName: 'Elena Rostova',
    userAvatar: 'https://api.dicebear.com/7.x/big-smile/svg?seed=Elena',
    isVipCreator: true,
    mediaUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=800',
    mediaType: 'image',
    caption: '🔒 Subscriber Exclusive: Early access breakdown of my 4K WebRTC video pipeline strategy!',
    tags: ['#VIPCreator', '#WebRTC', '#ExclusiveContent'],
    likesCount: 89,
    commentsCount: 12,
    isLiked: false,
    isExclusive: true,
    tipsEarned: 120,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    aiCategory: 'Exclusive',
    aiEngagementScore: 94
  },
  {
    id: 'post-3',
    userId: 'usr-marcus',
    userName: 'Marcus Vance',
    userAvatar: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Marcus',
    isVipCreator: false,
    mediaUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800',
    mediaType: 'image',
    caption: 'Late night architecture sessions hit different in dark mode 🌙',
    tags: ['#DeveloperLife', '#UIUX', '#Design'],
    likesCount: 64,
    commentsCount: 9,
    isLiked: true,
    isExclusive: false,
    tipsEarned: 15,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    aiCategory: 'Design',
    aiEngagementScore: 82
  }
];

export const SocialFeed: React.FC<Props> = ({ currentUser }) => {
  const [posts, setPosts] = useState<SocialPost[]>(INITIAL_POSTS);
  const [activeFeedTab, setActiveFeedTab] = useState<'all' | 'reels'>('all');
  const [isAiCurated, setIsAiCurated] = useState<boolean>(false);
  const [isAiRankingLoading, setIsAiRankingLoading] = useState<boolean>(false);

  // Modal States
  const [activeTipPost, setActiveTipPost] = useState<SocialPost | null>(null);
  const [tipAmount, setTipAmount] = useState<number>(5);
  const [tipMessage, setTipMessage] = useState<string>('');
  const [showTipSuccess, setShowTipSuccess] = useState<boolean>(false);

  // Analytics Modal State
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);

  // Create Post Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newMediaUrl, setNewMediaUrl] = useState<string>('');
  const [newCaption, setNewCaption] = useState<string>('');
  const [newTags, setNewTags] = useState<string>('#ApexMobile #VipCreator');
  const [isExclusivePost, setIsExclusivePost] = useState<boolean>(false);
  const [isGeneratingAiCaption, setIsGeneratingAiCaption] = useState<boolean>(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const handleMediaFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setNewMediaUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Unlocked exclusive posts map
  const [unlockedPosts, setUnlockedPosts] = useState<Record<string, boolean>>({});

  // Mock Analytics Data
  const analyticsData: CreatorAnalytics = {
    totalReach: 14850,
    totalImpressions: 42100,
    engagementRate: 8.4,
    totalEarnings: currentUser?.total_tips_earned || 245,
    subscribersCount: currentUser?.subscriber_count || 38,
    viewsHistory: [
      { label: 'Mon', views: 2400, revenue: 20 },
      { label: 'Tue', views: 3100, revenue: 35 },
      { label: 'Wed', views: 4800, revenue: 50 },
      { label: 'Thu', views: 6200, revenue: 65 },
      { label: 'Fri', views: 8900, revenue: 95 },
    ]
  };

  // Muted videos state map for Reels
  const [mutedVideos, setMutedVideos] = useState<Record<string, boolean>>({});

  const handleToggleMute = (postId: string) => {
    setMutedVideos((prev) => ({
      ...prev,
      [postId]: prev[postId] === undefined ? false : !prev[postId],
    }));
  };

  // Toggle Like
  const handleToggleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const isLiked = !p.isLiked;
          return {
            ...p,
            isLiked,
            likesCount: isLiked ? p.likesCount + 1 : p.likesCount - 1
          };
        }
        return p;
      })
    );
  };

  // AI Feed Curation Trigger
  const handleCurateFeedWithAi = async () => {
    setIsAiRankingLoading(true);
    try {
      const res = await fetch('/api/ai/rank-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts,
          userInterests: ['tech', 'e2ee', 'exclusive', 'design']
        })
      });
      const data = await res.json();
      if (data.rankedPosts) {
        setPosts(data.rankedPosts);
        setIsAiCurated(true);
      }
    } catch (e) {
      console.error('AI ranking error:', e);
    } finally {
      setIsAiRankingLoading(false);
    }
  };

  // Send Creator Tip
  const handleSendTip = () => {
    if (!activeTipPost) return;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === activeTipPost.id) {
          return { ...p, tipsEarned: (p.tipsEarned || 0) + tipAmount };
        }
        return p;
      })
    );
    setShowTipSuccess(true);
    setTimeout(() => {
      setShowTipSuccess(false);
      setActiveTipPost(null);
      setTipMessage('');
    }, 1600);
  };

  // AI Auto-Caption & Tags Generator
  const handleGenerateAiCaption = async () => {
    setIsGeneratingAiCaption(true);
    try {
      const res = await fetch('/api/ai/auto-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newCaption || 'Aesthetic tech lifestyle shot',
          mediaType: 'image'
        })
      });
      const data = await res.json();
      if (data.caption) setNewCaption(data.caption);
      if (data.tags && Array.isArray(data.tags)) setNewTags(data.tags.join(' '));
    } catch (e) {
      console.error('Auto caption error:', e);
    } finally {
      setIsGeneratingAiCaption(false);
    }
  };

  // Publish New Post
  const handlePublishPost = () => {
    if (!newMediaUrl && !newCaption) return;
    const createdPost: SocialPost = {
      id: 'post-' + Date.now(),
      userId: currentUser?.id || 'usr-current',
      userName: currentUser?.display_name || 'You',
      userAvatar: currentUser?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
      isVipCreator: true,
      mediaUrl: newMediaUrl || 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800',
      mediaType: 'image',
      caption: newCaption || 'New Apex Moment ✨',
      tags: newTags.split(' ').filter((t) => t.startsWith('#')),
      likesCount: 1,
      commentsCount: 0,
      isLiked: true,
      isExclusive: isExclusivePost,
      tipsEarned: 0,
      createdAt: new Date().toISOString(),
      aiCategory: 'Creator'
    };

    setPosts([createdPost, ...posts]);
    setShowCreateModal(false);
    setNewMediaUrl('');
    setNewCaption('');
    setIsExclusivePost(false);
  };

  const displayedPosts = activeFeedTab === 'reels' 
    ? posts.filter((p) => p.mediaType === 'video' || p.aiCategory === 'Reels')
    : posts;

  return (
    <div className="flex-1 bg-gray-950 text-gray-100 flex flex-col h-full overflow-hidden">
      {/* Header Bar */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Apex Social & Reels
          </h2>
          <div className="flex items-center bg-gray-950 p-1 rounded-xl border border-gray-800">
            <button
              onClick={() => setActiveFeedTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${activeFeedTab === 'all' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              All Posts
            </button>
            <button
              onClick={() => setActiveFeedTab('reels')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition ${activeFeedTab === 'reels' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Film className="w-3.5 h-3.5 text-amber-400" /> Reels
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Creator Analytics Button */}
          <button
            onClick={() => setShowAnalyticsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold border border-gray-700 transition"
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" /> Creator Hub
          </button>

          {/* New Post Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-lg shadow-emerald-900/30"
          >
            <PlusSquare className="w-3.5 h-3.5" /> Post
          </button>
        </div>
      </div>

      {/* Reels Tab: Instagram-Style Vertical Snap Scrolling Container */}
      {activeFeedTab === 'reels' ? (
        <div className="flex-1 overflow-y-scroll snap-y snap-mandatory scrollbar-none py-4 px-2 flex flex-col items-center gap-6">
          {displayedPosts.map((post) => (
            <div
              key={post.id}
              className="snap-start snap-always w-full max-w-sm h-[calc(100vh-120px)] max-h-[680px] bg-black rounded-3xl overflow-hidden relative shadow-2xl border border-gray-800 flex flex-col justify-between shrink-0 group"
            >
              {/* Full-Screen Video Background */}
              <video
                src={post.mediaUrl}
                autoPlay
                loop
                muted={mutedVideos[post.id] ?? true}
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Top Mute / Sound Overlay */}
              <div className="relative z-10 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-white bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                  <Film className="w-3.5 h-3.5 text-amber-400" /> Reels
                </span>

                <button
                  onClick={() => handleToggleMute(post.id)}
                  className="p-2 rounded-full bg-black/50 backdrop-blur-md text-white border border-white/20 hover:bg-black/70 transition"
                >
                  {mutedVideos[post.id] ?? true ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
              </div>

              {/* Right Side Overlay Action Icons (Instagram Style) */}
              <div className="absolute right-3 bottom-20 z-10 flex flex-col items-center gap-5">
                {/* Like Button */}
                <button
                  onClick={() => handleToggleLike(post.id)}
                  className="flex flex-col items-center gap-1 group/btn"
                >
                  <div className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/20 group-hover/btn:scale-110 transition">
                    <Heart className={`w-6 h-6 ${post.isLiked ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
                  </div>
                  <span className="text-xs font-bold text-white shadow-sm">{post.likesCount}</span>
                </button>

                {/* Comment Button */}
                <button className="flex flex-col items-center gap-1 group/btn">
                  <div className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/20 group-hover/btn:scale-110 transition">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs font-bold text-white shadow-sm">{post.commentsCount}</span>
                </button>

                {/* Tip Button */}
                <button
                  onClick={() => setActiveTipPost(post)}
                  className="flex flex-col items-center gap-1 group/btn"
                >
                  <div className="p-3 rounded-full bg-emerald-500/80 backdrop-blur-md border border-emerald-400/50 text-white group-hover/btn:scale-110 transition shadow-lg shadow-emerald-950/50">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs font-bold text-emerald-400">Tip</span>
                </button>

                {/* Share Button */}
                <button className="flex flex-col items-center gap-1 group/btn">
                  <div className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/20 group-hover/btn:scale-110 transition">
                    <Share2 className="w-6 h-6 text-white" />
                  </div>
                </button>
              </div>

              {/* Bottom Creator Info & Caption Overlay */}
              <div className="relative z-10 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col gap-2 max-w-[80%]">
                <div className="flex items-center gap-2.5">
                  <img
                    src={post.userAvatar}
                    alt={post.userName}
                    className="w-10 h-10 rounded-full border-2 border-emerald-500 object-cover shadow-lg"
                  />
                  <span className="font-extrabold text-sm text-white drop-shadow-md">{post.userName}</span>
                  {post.isVipCreator && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
                  )}
                  <button className="px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] ml-1 shadow-md">
                    Follow
                  </button>
                </div>

                <p className="text-xs text-white/90 line-clamp-2 leading-relaxed drop-shadow">
                  {post.caption}
                </p>

                {/* Sound Track Ticker */}
                <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-semibold mt-1 bg-black/40 px-2.5 py-1 rounded-full border border-emerald-500/30 w-fit">
                  <Music className="w-3 h-3 animate-spin text-amber-400" />
                  <span className="truncate">Original Sound - Tamil Trending Mix</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Regular Feed Posts Container */
        <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-6">
        {displayedPosts.map((post) => {
          const isLocked = post.isExclusive && !unlockedPosts[post.id];

          return (
            <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
              {/* Post Header */}
              <div className="p-3.5 flex items-center justify-between border-b border-gray-800/60">
                <div className="flex items-center gap-3">
                  <img
                    src={post.userAvatar}
                    alt={post.userName}
                    className="w-10 h-10 rounded-full object-cover border border-emerald-500/40"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-gray-100">{post.userName}</span>
                      {post.isVipCreator && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
                      )}
                      {post.mediaType === 'video' && (
                        <span className="flex items-center gap-0.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Film className="w-3 h-3" /> REEL
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {post.isExclusive && (
                  <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Lock className="w-3 h-3" /> VIP Exclusive
                  </span>
                )}
              </div>

              {/* Post Media Area */}
              <div className="relative aspect-square w-full bg-black overflow-hidden flex items-center justify-center">
                {post.mediaType === 'video' ? (
                  <video
                    src={post.mediaUrl}
                    controls
                    loop
                    muted
                    playsInline
                    onError={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const target = e.currentTarget;
                      target.style.display = 'none';
                    }}
                    className={`w-full h-full object-cover transition duration-500 ${isLocked ? 'blur-xl opacity-60' : ''}`}
                  />
                ) : (
                  <img
                    src={post.mediaUrl}
                    alt={post.caption}
                    className={`w-full h-full object-cover transition duration-500 ${isLocked ? 'blur-xl scale-105 opacity-60' : ''}`}
                  />
                )}

                {/* Locked Overlay for Exclusive Content */}
                {isLocked && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/60 backdrop-blur-md">
                    <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mb-3 shadow-lg shadow-amber-900/50">
                      <Lock className="w-7 h-7" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-100 mb-1">Subscriber Exclusive Post</h4>
                    <p className="text-xs text-gray-300 mb-4 max-w-xs">
                      Unlock full access to {post.userName}'s premium breakdown & raw assets.
                    </p>
                    <button
                      onClick={() => setUnlockedPosts((prev) => ({ ...prev, [post.id]: true }))}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-950 font-extrabold text-xs tracking-wider uppercase shadow-lg shadow-amber-900/40 transition active:scale-95"
                    >
                      Unlock for $2.99 / Subscribe
                    </button>
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              <div className="p-3.5 flex items-center justify-between border-t border-gray-800/80">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleToggleLike(post.id)}
                    className={`flex items-center gap-1.5 text-xs font-semibold transition ${post.isLiked ? 'text-rose-500' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    <Heart className={`w-5 h-5 ${post.isLiked ? 'fill-rose-500' : ''}`} />
                    {post.likesCount}
                  </button>

                  <button className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200">
                    <MessageCircle className="w-5 h-5" />
                    {post.commentsCount}
                  </button>

                  <button className="text-gray-400 hover:text-gray-200">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Creator Tip Button */}
                <button
                  onClick={() => setActiveTipPost(post)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 text-xs font-bold transition shadow-sm"
                >
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Tip Creator
                  {post.tipsEarned ? <span className="text-[10px] text-emerald-300 font-mono">(${post.tipsEarned})</span> : null}
                </button>
              </div>

              {/* Post Caption & Hashtags */}
              <div className="px-3.5 pb-4 space-y-1.5">
                <p className="text-sm text-gray-200 leading-relaxed">
                  <span className="font-bold text-gray-100 mr-2">{post.userName}</span>
                  {post.caption}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {post.tags.map((tag, idx) => (
                    <span key={idx} className="text-xs text-cyan-400 hover:underline cursor-pointer">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Creator Tip Modal */}
      {activeTipPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
            <button
              onClick={() => setActiveTipPost(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            {showTipSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
                  <DollarSign className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold text-emerald-400">Tip Sent Successfully!</h3>
                <p className="text-xs text-gray-300">You tipped ${tipAmount} to {activeTipPost.userName}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-2 border border-emerald-500/30">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-100">Support {activeTipPost.userName}</h3>
                  <p className="text-xs text-gray-400">Direct creator microtransaction in Apex Coins</p>
                </div>

                {/* Amount Presets */}
                <div>
                  <label className="text-xs text-gray-400 block mb-2 font-medium">Select Tip Amount</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 5, 10, 25].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTipAmount(amt)}
                        className={`py-2 rounded-xl text-xs font-bold transition border ${tipAmount === amt ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-900/50' : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'}`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Input */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1 font-medium">Note (Optional)</label>
                  <input
                    type="text"
                    value={tipMessage}
                    onChange={(e) => setTipMessage(e.target.value)}
                    placeholder="Keep up the amazing work! 🔥"
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={handleSendTip}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-gray-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-900/40 transition active:scale-95"
                >
                  Send ${tipAmount} Tip
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post Creation Modal with AI Caption Generator */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-lg font-bold text-gray-100">Create New Post / Reel</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Select Media from Internal Storage</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    className="flex-1 py-2.5 px-3 bg-gray-950 hover:bg-gray-800 border border-gray-800 text-emerald-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <Upload className="w-4 h-4" /> Choose Photo / Video File
                  </button>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleMediaFileUpload}
                    className="hidden"
                  />
                </div>
                {newMediaUrl && (
                  <div className="mt-2 relative rounded-xl overflow-hidden border border-emerald-500/50 max-h-36 bg-black flex items-center justify-center">
                    {newMediaUrl.startsWith('data:video') || newMediaUrl.includes('.mp4') ? (
                      <video
                        src={newMediaUrl}
                        className="max-h-36 w-full object-cover"
                        controls
                        playsInline
                        onError={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      />
                    ) : (
                      <img src={newMediaUrl} alt="Preview" className="max-h-36 w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setNewMediaUrl('')}
                      className="absolute top-1 right-1 p-1 bg-black/80 text-red-400 rounded-full hover:text-red-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">Caption</label>
                  <button
                    onClick={handleGenerateAiCaption}
                    disabled={isGeneratingAiCaption}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold hover:underline"
                  >
                    <Sparkles className={`w-3 h-3 ${isGeneratingAiCaption ? 'animate-spin' : ''}`} />
                    {isGeneratingAiCaption ? 'Generating AI Caption...' : '✨ AI Generate'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Write a caption or hit AI Generate..."
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-xs text-gray-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Hashtags</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="#ApexMobile #Creator"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-950 border border-gray-800">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-gray-200">Subscriber Only Exclusive</span>
                </div>
                <input
                  type="checkbox"
                  checked={isExclusivePost}
                  onChange={(e) => setIsExclusivePost(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
              </div>
            </div>

            <button
              onClick={handlePublishPost}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-900/40"
            >
              Publish Post
            </button>
          </div>
        </div>
      )}

      {/* Creator Hub & Analytics Dashboard Modal */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-extrabold text-gray-100">Creator Hub & Performance</h3>
              </div>
              <button onClick={() => setShowAnalyticsModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl">
                <span className="text-[10px] text-gray-400 block uppercase font-medium">Total Reach</span>
                <span className="text-lg font-black text-gray-100">{analyticsData.totalReach.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl">
                <span className="text-[10px] text-gray-400 block uppercase font-medium">Impressions</span>
                <span className="text-lg font-black text-emerald-400">{analyticsData.totalImpressions.toLocaleString()}</span>
              </div>
              <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl">
                <span className="text-[10px] text-gray-400 block uppercase font-medium">Subscribers</span>
                <span className="text-lg font-black text-cyan-400">{analyticsData.subscribersCount}</span>
              </div>
              <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl">
                <span className="text-[10px] text-gray-400 block uppercase font-medium">Total Tips</span>
                <span className="text-lg font-black text-amber-400">${analyticsData.totalEarnings}</span>
              </div>
            </div>

            {/* Weekly Performance Graph Bars */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <h4 className="text-xs font-bold text-gray-300 mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Weekly Reach & Tipping Trends
              </h4>
              <div className="flex items-end justify-between h-28 pt-2 px-2 gap-2">
                {analyticsData.viewsHistory.map((item, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">${item.revenue}</span>
                    <div
                      className="w-full bg-gradient-to-t from-emerald-600 to-teal-400 rounded-t-md transition-all duration-500"
                      style={{ height: `${(item.views / 9000) * 100}%` }}
                    />
                    <span className="text-[10px] text-gray-400 mt-1 font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
