import React, { useState, useEffect } from 'react';
import { BUBBLE_THEME_PRESETS, chatThemeService } from '../services/chatThemeService';
import { Paintbrush, Check, Pipette, MessageSquare } from 'lucide-react';

export const ChatBubbleColorSelector: React.FC = () => {
  const [currentColor, setCurrentColor] = useState<string>(chatThemeService.getBubbleColor());
  const [customHexInput, setCustomHexInput] = useState<string>(currentColor);

  useEffect(() => {
    const unsub = chatThemeService.subscribeBubbleColor((newColor) => {
      setCurrentColor(newColor);
      setCustomHexInput(newColor);
    });
    return unsub;
  }, []);

  const handleSelectColor = (hex: string) => {
    setCurrentColor(hex);
    setCustomHexInput(hex);
    chatThemeService.setBubbleColor(hex);
  };

  const handleCustomHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      setCurrentColor(val);
      chatThemeService.setBubbleColor(val);
    }
  };

  return (
    <div id="chat-bubble-color-selector" className="space-y-3.5 bg-[#0f1115] border border-[#2d3139] p-4 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paintbrush className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-semibold text-white">Message Bubble Color</h4>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">
          <span
            className="w-3 h-3 rounded-full border border-white/20 shadow-xs shrink-0"
            style={{ backgroundColor: currentColor }}
          />
          <span className="text-[10px] font-mono text-slate-300 font-bold uppercase">{currentColor}</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Customize the background color of sent chat bubbles for your chat sessions.
      </p>

      {/* Preset Swatches Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
        {BUBBLE_THEME_PRESETS.map((preset) => {
          const isSelected = currentColor.toLowerCase() === preset.bgHex.toLowerCase();
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectColor(preset.bgHex)}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30'
                  : 'border-[#2d3139] hover:border-slate-600 bg-slate-900/50'
              }`}
              title={preset.name}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center border border-white/20 shadow-md relative group/swatch"
                style={{ backgroundColor: preset.bgHex }}
              >
                {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3] drop-shadow-md" />}
              </div>
              <span className="text-[9px] font-medium text-slate-400 truncate max-w-full">{preset.name}</span>
            </button>
          );
        })}
      </div>

      {/* Custom Color Input & Live Preview Row */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Custom Hex Picker Input */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="bubble-custom-color-picker"
            className="relative cursor-pointer p-2 bg-slate-900 hover:bg-slate-800 border border-[#2d3139] rounded-xl flex items-center gap-2 text-xs text-slate-300 transition-colors"
            title="Pick custom color"
          >
            <Pipette className="w-3.5 h-3.5 text-emerald-400" />
            <input
              id="bubble-custom-color-picker"
              type="color"
              value={currentColor}
              onChange={(e) => handleSelectColor(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
            <span className="text-[10px] font-medium">Pick Custom</span>
          </label>

          <div className="flex items-center bg-slate-900 border border-[#2d3139] rounded-xl px-2.5 py-1.5">
            <span className="text-xs font-mono text-slate-500 mr-1">#</span>
            <input
              type="text"
              maxLength={7}
              value={customHexInput.replace('#', '')}
              onChange={(e) => handleCustomHexChange({ target: { value: `#${e.target.value.replace(/[^0-9A-Fa-f]/g, '')}` } } as any)}
              className="w-16 bg-transparent text-xs font-mono font-semibold text-white focus:outline-none uppercase"
              placeholder="059669"
            />
          </div>
        </div>

        {/* Live Chat Bubble Mini Preview */}
        <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] text-slate-400 pb-1 border-b border-slate-800/50">
            <span className="flex items-center gap-1 text-slate-300 font-medium">
              <MessageSquare className="w-2.5 h-2.5 text-emerald-400" /> Bubble Preview
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="bg-slate-800 text-slate-200 text-[10px] px-2.5 py-1 rounded-2xl rounded-bl-xs w-fit max-w-[85%] border border-slate-700/60">
              How does this look?
            </div>
            <div
              className="text-white text-[10px] px-2.5 py-1 rounded-2xl rounded-br-xs w-fit max-w-[85%] ml-auto font-medium shadow-sm transition-colors duration-200"
              style={{ backgroundColor: currentColor }}
            >
              Custom bubble theme applied! ✨
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
