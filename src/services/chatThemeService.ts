import type { CSSProperties } from 'react';

export interface ChatThemePattern {
  id: string;
  name: string;
  description: string;
  bgClass: string;
  style: CSSProperties;
  previewBg: string;
}

export const CHAT_THEME_PATTERNS: ChatThemePattern[] = [
  {
    id: 'slate',
    name: 'Classic Dark Slate',
    description: 'Deep minimalist dark slate background',
    bgClass: 'bg-[#090b0e]',
    style: {},
    previewBg: 'bg-[#090b0e]'
  },
  {
    id: 'doodle',
    name: 'WhatsApp Doodle',
    description: 'Subtle geometric dot & icon pattern',
    bgClass: 'bg-[#0b0e14]',
    style: {
      backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px), radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)`,
      backgroundSize: `24px 24px, 12px 12px`,
      backgroundPosition: `0 0, 6px 6px`
    },
    previewBg: 'bg-[#0b0e14]'
  },
  {
    id: 'grid',
    name: 'Cyber Matrix Grid',
    description: 'Futuristic technical grid lines',
    bgClass: 'bg-[#080a10]',
    style: {
      backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
      backgroundSize: `24px 24px`
    },
    previewBg: 'bg-[#080a10]'
  },
  {
    id: 'dots',
    name: 'Midnight Constellation',
    description: 'Starlight blue & purple constellation dots',
    bgClass: 'bg-[#070a12]',
    style: {
      backgroundImage: `radial-gradient(rgba(56, 189, 248, 0.2) 1.2px, transparent 1.2px), radial-gradient(rgba(168, 85, 247, 0.15) 1px, transparent 1px)`,
      backgroundSize: `32px 32px, 16px 16px`,
      backgroundPosition: `0 0, 8px 8px`
    },
    previewBg: 'bg-[#070a12]'
  },
  {
    id: 'emerald-aura',
    name: 'Emerald Ambient Glow',
    description: 'Smooth dark atmosphere with emerald aura glow',
    bgClass: 'bg-[#050f0c]',
    style: {
      backgroundImage: `radial-gradient(circle at 50% 25%, rgba(16, 185, 129, 0.15), transparent 70%), radial-gradient(circle at 80% 80%, rgba(5, 150, 105, 0.1), transparent 60%)`
    },
    previewBg: 'bg-[#050f0c]'
  },
  {
    id: 'nebula',
    name: 'Cosmic Nebula',
    description: 'Glowing violet & sapphire dark space mist',
    bgClass: 'bg-[#0a0714]',
    style: {
      backgroundImage: `radial-gradient(circle at 20% 20%, rgba(139, 92, 246, 0.18), transparent 60%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.15), transparent 60%)`
    },
    previewBg: 'bg-[#0a0714]'
  },
  {
    id: 'carbon',
    name: 'Carbon Diagonal',
    description: 'High-tech diagonal carbon texture',
    bgClass: 'bg-[#0c0e12]',
    style: {
      backgroundImage: `repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.04) 0, rgba(255, 255, 255, 0.04) 1px, transparent 0, transparent 10px)`
    },
    previewBg: 'bg-[#0c0e12]'
  },
  {
    id: 'hexagons',
    name: 'Hexagon Glow',
    description: 'Dual-tone glow with subtle geometric mesh',
    bgClass: 'bg-[#070b10]',
    style: {
      backgroundImage: `radial-gradient(circle at 10% 50%, rgba(34, 197, 94, 0.08), transparent 50%), radial-gradient(circle at 90% 50%, rgba(59, 130, 246, 0.08), transparent 50%), linear-gradient(135deg, rgba(255,255,255,0.03) 25%, transparent 25%), linear-gradient(225deg, rgba(255,255,255,0.03) 25%, transparent 25%)`,
      backgroundSize: `100% 100%, 100% 100%, 28px 28px, 28px 28px`
    },
    previewBg: 'bg-[#070b10]'
  }
];

const STORAGE_KEY = 'nexus_chat_theme_pattern_v1';
const BUBBLE_STORAGE_KEY = 'nexus_chat_bubble_color_v1';

export interface BubbleThemePreset {
  id: string;
  name: string;
  bgHex: string;
}

export const BUBBLE_THEME_PRESETS: BubbleThemePreset[] = [
  { id: 'emerald', name: 'Emerald', bgHex: '#059669' },
  { id: 'indigo', name: 'Indigo', bgHex: '#4f46e5' },
  { id: 'blue', name: 'Sapphire', bgHex: '#2563eb' },
  { id: 'purple', name: 'Violet', bgHex: '#9333ea' },
  { id: 'rose', name: 'Rose', bgHex: '#e11d48' },
  { id: 'crimson', name: 'Crimson', bgHex: '#dc2626' },
  { id: 'amber', name: 'Amber', bgHex: '#d97706' },
  { id: 'teal', name: 'Teal', bgHex: '#0d9488' },
  { id: 'slate', name: 'Slate', bgHex: '#334155' },
];

type ThemeChangeListener = (patternId: string) => void;
type BubbleColorListener = (colorHex: string) => void;

const listeners: Set<ThemeChangeListener> = new Set();
const bubbleListeners: Set<BubbleColorListener> = new Set();

export const chatThemeService = {
  getThemePattern(): string {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && CHAT_THEME_PATTERNS.some(p => p.id === saved)) {
        return saved;
      }
    } catch {
      // Fallback
    }
    return 'doodle';
  },

  getPatternById(id: string): ChatThemePattern {
    return CHAT_THEME_PATTERNS.find(p => p.id === id) || CHAT_THEME_PATTERNS[1];
  },

  setThemePattern(id: string): void {
    if (!CHAT_THEME_PATTERNS.some(p => p.id === id)) return;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // LocalStorage error fallback
    }
    listeners.forEach(fn => fn(id));
  },

  subscribeThemePattern(listener: ThemeChangeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getBubbleColor(): string {
    try {
      const saved = localStorage.getItem(BUBBLE_STORAGE_KEY);
      if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
        return saved;
      }
    } catch {
      // Fallback
    }
    return '#059669'; // Default Emerald Green
  },

  setBubbleColor(colorHex: string): void {
    if (!/^#[0-9A-Fa-f]{6}$/.test(colorHex)) return;
    try {
      localStorage.setItem(BUBBLE_STORAGE_KEY, colorHex);
    } catch {
      // Fallback
    }
    bubbleListeners.forEach(fn => fn(colorHex));
  },

  subscribeBubbleColor(listener: BubbleColorListener): () => void {
    bubbleListeners.add(listener);
    return () => {
      bubbleListeners.delete(listener);
    };
  }
};
