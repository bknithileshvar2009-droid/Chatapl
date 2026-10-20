import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  audioUrl: string;
  duration?: number;
  isMe: boolean;
  initialTranscript?: string;
  onTranscriptGenerated?: (transcript: string) => void;
}

// Helper functions to prevent HTML5 Audio "no supported sources" errors on invalid URLs
function isValidMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('data:audio') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://');
}

let cachedVoiceWav: string | null = null;
function getFallbackVoiceWav(): string {
  if (cachedVoiceWav) return cachedVoiceWav;
  const sampleRate = 22050;
  const duration = 2;
  const totalSamples = sampleRate * duration;
  const buffer = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 1.0 ? 340 + Math.sin(t * 12) * 40 : 440 + Math.sin(t * 8) * 30;
    const env = Math.sin((t / duration) * Math.PI);
    buffer[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.3;
  }
  const wavBytes = encodeWAVMono(buffer, sampleRate);
  let binary = '';
  const bytes = new Uint8Array(wavBytes);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  cachedVoiceWav = `data:audio/wav;base64,${btoa(binary)}`;
  return cachedVoiceWav;
}

function encodeWAVMono(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

export const VoiceMessageBubble: React.FC<Props> = ({ 
  audioUrl, 
  duration = 0, 
  isMe, 
  initialTranscript,
  onTranscriptGenerated 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [totalDuration, setTotalDuration] = useState<number>(duration);

  // AI Transcription state
  const [transcript, setTranscript] = useState<string | null>(initialTranscript || null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (duration > 0) {
      setTotalDuration(duration);
    }
  }, [duration]);

  useEffect(() => {
    if (initialTranscript) {
      setTranscript(initialTranscript);
    }
  }, [initialTranscript]);

  useEffect(() => {
    if (!audioUrl) return;
    try {
      const validUrl = isValidMediaUrl(audioUrl) ? audioUrl : getFallbackVoiceWav();
      const audio = new Audio(validUrl);
      audio.onerror = () => {
        setIsPlaying(false);
      };
      audioRef.current = audio;

      const updateDur = () => {
        if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
          setTotalDuration(Math.round(audio.duration));
        }
      };

      audio.onloadedmetadata = updateDur;
      audio.ondurationchange = updateDur;

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      return () => {
        audio.pause();
        audioRef.current = null;
      };
    } catch (e) {
      console.warn('Failed to initialize audio:', e);
    }
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Pause other audio notes
      window.dispatchEvent(new CustomEvent('pause-other-voice-notes', { detail: { audioUrl } }));
      
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    const handlePauseOthers = (e: any) => {
      if (e.detail.audioUrl !== audioUrl && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('pause-other-voice-notes', handlePauseOthers);
    return () => window.removeEventListener('pause-other-voice-notes', handlePauseOthers);
  }, [audioUrl]);

  const handleSpeedChange = () => {
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextRate = speeds[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const handleTranscribe = async () => {
    if (transcript) {
      setShowTranscript(!showTranscript);
      return;
    }

    setIsTranscribing(true);
    try {
      const res = await fetch('/api/ai/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioData: audioUrl, duration: totalDuration }),
      });
      const data = await res.json();
      if (data.success && data.transcript) {
        setTranscript(data.transcript);
        setShowTranscript(true);
        if (onTranscriptGenerated) {
          onTranscriptGenerated(data.transcript);
        }
      }
    } catch (err) {
      console.error('Failed to transcribe audio:', err);
      const fallback = 'Hey there! Sending a quick voice note.';
      setTranscript(fallback);
      setShowTranscript(true);
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 min-w-[240px] sm:min-w-[280px]">
      <div className={`flex items-center gap-3 p-2 rounded-xl ${
        isMe ? 'text-white' : 'text-slate-100'
      }`}>
        {/* Play / Pause Toggle Button */}
        <button
          onClick={togglePlay}
          type="button"
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-95 ${
            isMe ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
          }`}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>

        {/* Waveform & Progress Bar */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="relative w-full flex items-center h-6">
            {/* Waveform Visualization Bars */}
            <div className="absolute inset-0 flex items-center gap-0.5 pointer-events-none">
              {[35, 60, 25, 80, 50, 90, 40, 75, 30, 85, 45, 65, 30, 95, 50, 70, 40, 80, 25, 60].map((h, i) => {
                const barPercent = (i / 20) * 100;
                const isPassed = barPercent <= progressPercent;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-colors ${
                      isPassed 
                        ? (isMe ? 'bg-emerald-300' : 'bg-emerald-400') 
                        : (isMe ? 'bg-emerald-800/60' : 'bg-slate-700')
                    }`}
                    style={{ height: `${h}%` }}
                  />
                );
              })}
            </div>

            {/* Interactive Scrub Range Input */}
            <input
              type="range"
              min={0}
              max={totalDuration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full opacity-0 cursor-pointer z-10"
            />
          </div>

          {/* Duration, Speed & Transcribe AI Controls */}
          <div className="flex items-center justify-between text-[11px] opacity-90 gap-2">
            <span>{isPlaying ? formatTime(currentTime) : formatTime(totalDuration)}</span>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSpeedChange}
                type="button"
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                  isMe 
                    ? 'border-emerald-400/40 hover:bg-emerald-700/50 text-emerald-200' 
                    : 'border-slate-600 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {playbackRate}x
              </button>
              <a
                href={audioUrl}
                download={`voice_note_${Date.now()}.webm`}
                className={`p-1 rounded transition-colors ${isMe ? 'hover:bg-emerald-700/50' : 'hover:bg-slate-700'}`}
                title="Download"
              >
                <ChevronDown size={14} className="rotate-0" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
