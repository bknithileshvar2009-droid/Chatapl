import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Minimize2, Maximize2, Monitor, RefreshCw, Signal, Pencil } from 'lucide-react';
import { CallSession } from '../types';
import { webrtcCallService } from '../services/webrtcCallService';
import { CollaborativeWhiteboard } from './CollaborativeWhiteboard';

interface Props {
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  onAcceptIncomingCall: (call: CallSession) => void;
  onRejectIncomingCall: (callId: string) => void;
  currentUserId: string;
}

export const CallModal: React.FC<Props> = ({
  activeCall,
  incomingCall,
  localStream,
  remoteStream,
  onEndCall,
  onAcceptIncomingCall,
  onRejectIncomingCall,
  currentUserId
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Attach local stream to video ref
  useEffect(() => {
    if (localVideoRef.current) {
      if (localStream) {
        localVideoRef.current.srcObject = localStream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      } else {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [localStream, activeCall, isMinimized]);

  // Attach remote stream to video ref
  useEffect(() => {
    if (remoteVideoRef.current) {
      if (remoteStream && remoteStream.getTracks().length > 0) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(() => {});
      } else {
        remoteVideoRef.current.srcObject = null;
      }
    }
  }, [remoteStream, activeCall, isMinimized]);

  // Frame-buffer cleanup loop for ultra-low latency WebRTC streaming
  useEffect(() => {
    if (!remoteVideoRef.current || !remoteStream) return;

    const videoEl = remoteVideoRef.current;
    const cleanupFrameBuffer = () => {
      if (videoEl && videoEl.buffered && videoEl.buffered.length > 0) {
        const liveHead = videoEl.buffered.end(videoEl.buffered.length - 1);
        const lag = liveHead - videoEl.currentTime;
        // If frame buffer lag exceeds 120ms, flush buffer by jumping directly to live head
        if (lag > 0.12 && !videoEl.paused) {
          videoEl.currentTime = Math.max(0, liveHead - 0.01);
        }
      }
    };

    const interval = setInterval(cleanupFrameBuffer, 500);
    return () => clearInterval(interval);
  }, [remoteStream, activeCall]);

  // Call duration counter
  useEffect(() => {
    let timer: any;
    if (activeCall && activeCall.status === 'answered') {
      timer = setInterval(() => setCallDuration((prev) => prev + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [activeCall]);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    webrtcCallService.toggleMute(next);
  };

  const handleToggleVideo = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    webrtcCallService.toggleCamera(next);
  };

  const handleToggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setIsScreenSharing(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
      } catch (err) {
        console.error('Screen sharing error:', err);
      }
    } else {
      setIsScreenSharing(false);
      if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // 1. Render Incoming Call Popup Banner / Modal
  if (incomingCall && !activeCall) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-center text-white">
          <div className="relative inline-block mb-4">
            <div className="w-24 h-24 rounded-full overflow-hidden mx-auto border-4 border-emerald-500/40 shadow-lg animate-pulse">
              <img 
                src={incomingCall.callerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${incomingCall.callerName}`} 
                alt={incomingCall.callerName} 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-2 rounded-full shadow-md">
              {incomingCall.type === 'video' ? <Video size={18} /> : <Phone size={18} />}
            </div>
          </div>

          <h3 className="text-xl font-bold text-slate-100">{incomingCall.callerName}</h3>
          <p className="text-sm text-emerald-400 font-medium mt-1">
            Incoming {incomingCall.type === 'video' ? 'Video' : 'Audio'} Call...
          </p>

          <div className="flex items-center justify-center gap-6 mt-8">
            <button
              onClick={() => onRejectIncomingCall(incomingCall.id)}
              className="flex flex-col items-center gap-1 group"
            >
              <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95">
                <PhoneOff size={24} />
              </div>
              <span className="text-xs text-slate-400 group-hover:text-slate-200">Decline</span>
            </button>

            <button
              onClick={() => onAcceptIncomingCall(incomingCall)}
              className="flex flex-col items-center gap-1 group"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg transition-transform active:scale-95 animate-bounce">
                <Phone size={24} />
              </div>
              <span className="text-xs text-slate-400 group-hover:text-slate-200">Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active Call State
  if (!activeCall) return null;

  const isCaller = activeCall.callerId === currentUserId;
  const peerName = isCaller ? activeCall.calleeName : activeCall.callerName;
  const peerAvatar = isCaller ? activeCall.calleeAvatar : activeCall.callerAvatar;

  // Render Minimized Floating Call Pill
  if (isMinimized) {
    return (
      <div className="fixed top-4 right-4 z-50 bg-slate-900/95 border border-emerald-500/40 rounded-2xl p-3 shadow-2xl flex items-center gap-3 backdrop-blur-md text-white animate-fade-in">
        <div className="relative">
          <img
            src={peerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerName}`}
            alt={peerName}
            className="w-9 h-9 rounded-full object-cover border border-emerald-400"
          />
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 animate-ping" />
        </div>

        <div>
          <h5 className="text-xs font-bold text-slate-100">{peerName}</h5>
          <span className="text-[10px] text-emerald-400 font-mono font-medium">
            {formatDuration(callDuration)} • {activeCall.type.toUpperCase()}
          </span>
        </div>

        <button
          onClick={handleToggleMute}
          className={`p-2 rounded-xl transition ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-200'}`}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        <button
          onClick={() => setIsMinimized(false)}
          className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition"
        >
          <Maximize2 size={16} />
        </button>

        <button
          onClick={onEndCall}
          className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-xl transition"
        >
          <PhoneOff size={16} />
        </button>
      </div>
    );
  }

  // Render Full Active Call Modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-3xl h-[80vh] max-h-[600px] bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header Bar */}
        <div className="absolute top-0 inset-x-0 z-20 p-4 bg-gradient-to-b from-slate-950/80 to-transparent flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-700">
              <img 
                src={peerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerName}`} 
                alt={peerName} 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-slate-100 text-base">{peerName}</h4>
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  <Signal className="w-3 h-3 text-emerald-400 animate-pulse" /> Low Latency • Adaptive Stream
                </span>
              </div>
              <p className="text-xs text-emerald-400 font-medium">
                {activeCall.status === 'answered' ? formatDuration(callDuration) : 'Calling...'}
              </p>
            </div>
          </div>

          {/* Minimize Call Button */}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition"
            title="Minimize call floating bar"
          >
            <Minimize2 size={18} />
          </button>
        </div>

        {/* Video / Audio Canvas Container */}
        <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
          <video
            ref={remoteVideoRef}
            playsInline
            onError={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="w-full h-full object-cover"
            id="remote-video-stream"
          />

          {/* Audio Avatar Overlay if Audio Call */}
          {activeCall.type === 'audio' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-white p-6">
              <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-slate-800 shadow-2xl mb-4 animate-pulse">
                <img 
                  src={peerAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerName}`} 
                  alt={peerName} 
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-slate-400 text-sm">Voice call in progress...</p>
            </div>
          )}

          {/* Local PIP Video Preview */}
          {activeCall.type === 'video' && (
            <div className="absolute bottom-4 right-4 w-32 h-44 bg-slate-900 border-2 border-slate-700 rounded-2xl overflow-hidden shadow-2xl z-10">
              <video
                ref={localVideoRef}
                playsInline
                muted
                onError={(e) => { e.preventDefault(); e.stopPropagation(); }}
                className="w-full h-full object-cover"
                id="local-video-stream"
              />
            </div>
          )}
        </div>

        {/* Floating Call Controls Bar */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-center gap-4">
          <button
            onClick={handleToggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md ${
              isMuted ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {activeCall.type === 'video' && (
            <>
              <button
                onClick={handleToggleVideo}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md ${
                  isVideoOff ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>

              <button
                onClick={handleToggleScreenShare}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md ${
                  isScreenSharing ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
                title="Screen Share"
              >
                <Monitor size={20} />
              </button>
            </>
          )}

          <button
            onClick={() => setShowWhiteboard(true)}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-colors shadow-md bg-sky-600/30 hover:bg-sky-600/50 text-sky-400 border border-sky-500/40"
            title="Open Collaborative Whiteboard"
          >
            <Pencil size={20} />
          </button>

          <button
            onClick={onEndCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>

      {showWhiteboard && activeCall && (
        <CollaborativeWhiteboard
          boardId={`call-${activeCall.id}`}
          currentUserId={currentUserId}
          currentUserName={peerName}
          onClose={() => setShowWhiteboard(false)}
        />
      )}
    </div>
  );
};

