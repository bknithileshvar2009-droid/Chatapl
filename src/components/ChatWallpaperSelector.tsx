import React, { useState, useEffect } from 'react';
import { CHAT_THEME_PATTERNS, chatThemeService, ChatThemePattern } from '../services/chatThemeService';
import { Palette, Check, Sparkles, MessageSquare } from 'lucide-react';

export const ChatWallpaperSelector: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(chatThemeService.getThemePattern());

  useEffect(() => {
    const unsub = chatThemeService.subscribeThemePattern((newId) => {
      setSelectedId(newId);
    });
    return unsub;
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    chatThemeService.setThemePattern(id);
  };

  return (
    <div id="chat-wallpaper-selector" className="space-y-3.5 bg-[#0f1115] border border-[#2d3139] p-4 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-semibold text-white">Chat Background Pattern</h4>
        </div>
        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> Live Preview
        </span>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Choose a pre-defined dark background pattern for your chat area stream.
      </p>

      {/* Pattern Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        {CHAT_THEME_PATTERNS.map((pattern: ChatThemePattern) => {
          const isSelected = selectedId === pattern.id;

          return (
            <button
              key={pattern.id}
              type="button"
              onClick={() => handleSelect(pattern.id)}
              className={`relative group rounded-xl overflow-hidden border-2 transition-all text-left flex flex-col justify-between p-2.5 h-24 shadow-sm hover:scale-[1.02] ${
                isSelected
                  ? 'border-emerald-500 ring-2 ring-emerald-500/40 bg-slate-900'
                  : 'border-[#2d3139] hover:border-slate-600 bg-slate-950'
              }`}
            >
              {/* Pattern Background Preview Layer */}
              <div
                className={`absolute inset-0 transition-opacity ${pattern.bgClass}`}
                style={pattern.style}
              />

              {/* Sample Mini Chat Message Overlay */}
              <div className="relative z-10 w-full space-y-1">
                <div className="bg-emerald-600/90 text-[9px] text-slate-950 font-bold px-2 py-0.5 rounded-md w-fit shadow-2xs flex items-center gap-1">
                  <MessageSquare className="w-2.5 h-2.5" />
                  <span>Hello!</span>
                </div>
                <div className="bg-[#1a1c20]/90 text-[8px] text-slate-300 px-1.5 py-0.5 rounded-md w-fit ml-auto border border-[#2d3139]">
                  Hey there
                </div>
              </div>

              {/* Title & Selected Badge */}
              <div className="relative z-10 flex items-center justify-between w-full pt-1">
                <span className={`text-[10px] font-semibold truncate ${isSelected ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {pattern.name}
                </span>

                {isSelected && (
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
