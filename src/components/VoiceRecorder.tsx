import React, { useState, useEffect, useRef } from 'react';
import { Mic, Trash2, Send, Loader2, ChevronLeft } from 'lucide-react';

interface Props {
  onSendVoiceNote: (audioBlob: Blob, durationSeconds: number) => void;
  onCancel: () => void;
  isUploading?: boolean;
}

export const VoiceRecorder: React.FC<Props> = ({ onSendVoiceNote, onCancel, isUploading = false }) => {
  const [recordingTime, setRecordingTime] = useState(0);
  const [isRecording, setIsRecording] = useState(true);
  const [audioLevels, setAudioLevels] = useState<number[]>([30, 40, 20, 60, 80, 50, 30, 70, 40, 20, 50, 30]);

  // Swipe to Cancel Gesture State
  const [dragOffset, setDragOffset] = useState(0); // Negative when dragging left
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Touch gesture handlers for swipe to cancel
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - touchStartXRef.current;
    // Only allow dragging left (negative deltaX)
    if (deltaX < 0) {
      setDragOffset(deltaX);
      if (deltaX < -90) {
        // Exceeded cancel threshold
        handleCancel();
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchStartXRef.current = null;
    if (dragOffset < -70) {
      handleCancel();
    } else {
      setDragOffset(0);
    }
  };

  // Mouse gesture handlers for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    touchStartXRef.current = e.clientX;
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || touchStartXRef.current === null) return;
    const deltaX = e.clientX - touchStartXRef.current;
    if (deltaX < 0) {
      setDragOffset(deltaX);
      if (deltaX < -90) {
        handleCancel();
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    touchStartXRef.current = null;
    if (dragOffset < -70) {
      handleCancel();
    } else {
      setDragOffset(0);
    }
  };

  useEffect(() => {
    startRecording();
    return () => {
      stopAndCleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Initialize Web Audio API AudioContext & AnalyserNode for audio processing
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        try {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateAudioLevels = () => {
            if (analyserRef.current) {
              analyserRef.current.getByteFrequencyData(dataArray);
              const levels: number[] = [];
              for (let i = 0; i < 12; i++) {
                const val = dataArray[i % dataArray.length] || 0;
                const percentage = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
                levels.push(percentage);
              }
              setAudioLevels(levels);
              animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
            }
          };
          updateAudioLevels();
        } catch (e) {
          console.warn('Web Audio API analyzer initialization failed:', e);
        }
      }

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to access microphone via Web Audio API:', err);
      alert('Could not access microphone for voice note. Please grant microphone permissions.');
      onCancel();
    }
  };

  const stopAndCleanup = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (e) {
        console.warn('Error stopping recorder:', e);
      }
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
    }
  };

  const handleSend = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    const finalDuration = Math.max(1, recordingTime);

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
      onSendVoiceNote(audioBlob, finalDuration);
    };

    if (recorder.state === 'recording') {
      try {
        recorder.requestData();
      } catch (e) {
        console.warn('requestData failed:', e);
      }
    }

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (e) {
        console.warn('stop recorder failed:', e);
      }
    }
  };

  const handleCancel = () => {
    stopAndCleanup();
    onCancel();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ transform: `translateX(${dragOffset}px)` }}
      className="flex items-center justify-between w-full bg-slate-800/95 border border-emerald-500/30 rounded-2xl px-4 py-2 text-white animate-fade-in shadow-xl select-none touch-none transition-transform duration-75"
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
        </div>

        <div className="flex flex-col">
          <span className="font-mono text-sm font-semibold text-slate-100">
            {formatTime(recordingTime)}
          </span>
          <span className="text-[10px] font-medium text-emerald-400/90 flex items-center gap-1">
            <Mic size={10} /> Recording
          </span>
        </div>

        {/* Dynamic Real-time Audio Frequency Waveform Visualizer */}
        <div className="hidden sm:flex items-center gap-1 h-6 overflow-hidden px-2">
          {audioLevels.map((lvl, idx) => (
            <div
              key={idx}
              className="w-1 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-full transition-all duration-75"
              style={{
                height: `${lvl}%`
              }}
            />
          ))}
        </div>
      </div>

      {/* Swipe Left to Cancel visual cue */}
      <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold animate-pulse px-2">
        <ChevronLeft className="w-4 h-4 text-red-400 animate-bounce" />
        <span className="text-[11px] hidden xs:inline text-slate-300">Slide left to cancel</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleCancel}
          disabled={isUploading}
          type="button"
          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded-full transition-colors disabled:opacity-50"
          title="Discard Voice Note"
        >
          <Trash2 size={18} />
        </button>

        <button
          onClick={handleSend}
          disabled={isUploading}
          type="button"
          className="p-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-full shadow-md transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center"
          title="Send Voice Note"
        >
          {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
};
