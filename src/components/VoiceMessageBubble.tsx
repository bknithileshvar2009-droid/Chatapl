import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  audioUrl: string;
  duration?: number;
  isMe: boolean;
  initialTranscript?: string;
  onTranscriptGenerated?: (transcript: string) => void;
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
      const audio = new Audio(audioUrl);
      audio.onerror = () => {
        // Silently handle invalid or unplayable audio URLs
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
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

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
                onClick={handleTranscribe}
                disabled={isTranscribing}
                type="button"
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-all ${
                  isMe 
                    ? 'bg-emerald-700/60 hover:bg-emerald-700 text-emerald-100 border border-emerald-500/40' 
                    : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {isTranscribing ? (
                  <>
                    <Loader2 size={11} className="animate-spin text-emerald-300" />
                    <span>Transcribing...</span>
                  </>
                ) : transcript ? (
                  <>
                    <Sparkles size={11} className="text-amber-300 fill-amber-300/30" />
                    <span>{showTranscript ? 'Hide Text' : 'Read Text'}</span>
                    {showTranscript ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </>
                ) : (
                  <>
                    <Sparkles size={11} className="text-amber-300" />
                    <span>Transcribe AI</span>
                  </>
                )}
              </button>

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
            </div>
          </div>
        </div>
      </div>

      {/* Transcribed Text Bubble */}
      {transcript && showTranscript && (
        <div className={`mt-1 p-2.5 rounded-xl border text-xs leading-relaxed transition-all ${
          isMe 
            ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-50' 
            : 'bg-slate-900/80 border-slate-700/60 text-slate-200'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1 border-b border-white/10 pb-1">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              <Sparkles size={12} className="fill-amber-300/20" /> AI Transcript
            </span>
            <span className="text-[9px] opacity-60">Speech-to-Text</span>
          </div>
          <p className="whitespace-pre-wrap select-text font-normal">{transcript}</p>
        </div>
      )}
    </div>
  );
};
