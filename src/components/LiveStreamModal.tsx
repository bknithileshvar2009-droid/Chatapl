import React, { useState, useEffect, useRef } from 'react';
import { Video, Heart, Send, Sparkles, Users, Gift, Radio, X, Shield, MessageCircle, AlertCircle } from 'lucide-react';
import { Profile } from '../types';

interface Props {
  currentUser: Profile;
  isOpen: boolean;
  onClose: () => void;
}

interface LiveComment {
  id: string;
  user: string;
  avatar: string;
  text: string;
  isGift?: boolean;
}

export const LiveStreamModal: React.FC<Props> = ({ currentUser, isOpen, onClose }) => {
  const [comments, setComments] = useState<LiveComment[]>([
    { id: '1', user: 'Alex Rivera', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100', text: 'Welcome to the live broadcast! 🎉' },
    { id: '2', user: 'Sarah Jenkins', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100', text: 'Audio and video quality look crisp! 🔥' },
  ]);
  const [inputText, setInputText] = useState('');
  const [viewerCount, setViewerCount] = useState(1480);
  const [heartsCount, setHeartsCount] = useState(890);
  const [giftEffect, setGiftEffect] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Render simulated live video broadcast onto canvas
  useEffect(() => {
    if (!isOpen) return;

    let frame = 0;
    let animId: number;

    const renderBroadcast = () => {
      frame++;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Animated studio lights background
      const grad = ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, w/2);
      grad.addColorStop(0, '#1e1b4b');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Studio spotlight effect
      const spotGrad = ctx.createRadialGradient(
        w/2 + Math.sin(frame * 0.03) * 50,
        150,
        10,
        w/2 + Math.sin(frame * 0.03) * 50,
        150,
        200
      );
      spotGrad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
      spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, w, h);

      // Presenter silhouette / avatar badge
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(w/2, h/2 - 20, 60 + Math.sin(frame * 0.05) * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎙️ LIVE BROADCAST', w/2, h/2 - 12);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Host: ${currentUser.display_name} (@${currentUser.username})`, w/2, h/2 + 25);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#10b981';
      ctx.fillText('1080p 60FPS • Low Latency Agora Protocol', w/2, h/2 + 50);

      animId = requestAnimationFrame(renderBroadcast);
    };

    renderBroadcast();

    const viewerInterval = setInterval(() => {
      setViewerCount(prev => prev + Math.floor(Math.random() * 5) - 2);
    }, 2000);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(viewerInterval);
    };
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newC: LiveComment = {
      id: Date.now().toString(),
      user: currentUser.display_name,
      avatar: currentUser.avatar_url,
      text: inputText.trim()
    };

    setComments(prev => [...prev.slice(-15), newC]);
    setInputText('');
  };

  const handleSendGift = (giftName: string) => {
    setGiftEffect(`💎 ${giftName} Sent! (+100 Creator Points)`);
    setHeartsCount(prev => prev + 50);

    const giftC: LiveComment = {
      id: Date.now().toString(),
      user: currentUser.display_name,
      avatar: currentUser.avatar_url,
      text: `sent a ${giftName}! 🎁`,
      isGift: true
    };
    setComments(prev => [...prev.slice(-15), giftC]);

    setTimeout(() => setGiftEffect(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-lg h-[85vh] max-h-[700px] overflow-hidden text-white shadow-2xl flex flex-col relative">
        {/* Stream Canvas */}
        <canvas
          ref={canvasRef}
          width={600}
          height={700}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Top Floating Live Bar */}
        <div className="absolute top-0 inset-x-0 z-20 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1 rounded-full text-xs font-black tracking-wider animate-pulse shadow-md">
              <Radio className="w-3.5 h-3.5" /> LIVE
            </div>
            <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-full text-xs font-bold text-slate-200 border border-slate-700">
              <Users className="w-3 h-3 text-emerald-400" /> {viewerCount.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setHeartsCount(prev => prev + 1)}
              className="flex items-center gap-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 px-3 py-1 rounded-full text-xs font-extrabold transition active:scale-110"
            >
              <Heart className="w-3.5 h-3.5 fill-red-400 animate-bounce" /> {heartsCount}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 transition border border-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Gift Effect Popup Banner */}
        {giftEffect && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-emerald-500 text-slate-950 font-black px-4 py-2 rounded-2xl shadow-2xl text-xs flex items-center gap-2 animate-bounce border border-emerald-300">
            <Sparkles className="w-4 h-4" /> {giftEffect}
          </div>
        )}

        {/* Bottom Stream Controls & Chat Overlay */}
        <div className="mt-auto z-20 p-4 bg-gradient-to-t from-black via-black/80 to-transparent space-y-3">
          {/* Live Chat Messages Feed */}
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
            {comments.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs backdrop-blur-md ${
                  c.isGift ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200' : 'bg-slate-900/80 text-slate-100'
                }`}
              >
                <img src={c.avatar} alt={c.user} className="w-5 h-5 rounded-full object-cover shrink-0" />
                <span className="font-bold text-emerald-400 shrink-0">{c.user}:</span>
                <span className="truncate">{c.text}</span>
              </div>
            ))}
          </div>

          {/* Gift Tipping Toolbar */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => handleSendGift('Diamond Super Gift')}
              className="flex-1 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 shadow-md hover:brightness-110 active:scale-95 transition"
            >
              <Gift className="w-3.5 h-3.5" /> Tip Diamond 💎
            </button>
            <button
              onClick={() => handleSendGift('Gold Crown')}
              className="flex-1 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 shadow-md hover:brightness-110 active:scale-95 transition"
            >
              <Sparkles className="w-3.5 h-3.5" /> Tip Crown 👑
            </button>
          </div>

          {/* Comment Input Bar */}
          <form onSubmit={handleSendComment} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Send live comment..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 px-3.5 py-2.5 bg-slate-900/90 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="p-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
