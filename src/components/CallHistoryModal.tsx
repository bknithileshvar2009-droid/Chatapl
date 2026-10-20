import React, { useState, useEffect } from 'react';
import { CallLog, callHistoryService } from '../services/callHistoryService';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Trash2, X, Clock, UserCheck } from 'lucide-react';
import { Profile } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInitiateCall: (type: 'audio' | 'video', callee: Profile) => void;
}

export const CallHistoryModal: React.FC<Props> = ({ isOpen, onClose, onInitiateCall }) => {
  const [logs, setLogs] = useState<CallLog[]>(callHistoryService.getLogs());

  useEffect(() => {
    if (!isOpen) return;
    const unsub = callHistoryService.subscribe((updated) => setLogs(updated));
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDuration = (secs: number) => {
    if (secs <= 0) return 'Missed';
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (mins === 0) return `${remainingSecs}s`;
    return `${mins}m ${remainingSecs}s`;
  };

  const formatTime = (iso: string) => {
    try {
      const date = new Date(iso);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleCallBack = (log: CallLog) => {
    onClose();
    const mockProfile: Profile = {
      id: log.peerId,
      username: log.peerName.toLowerCase().replace(/\s+/g, '_'),
      display_name: log.peerName,
      bio: 'Call Contact',
      avatar_url: log.peerAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
      is_private: false,
      is_online: true,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onInitiateCall(log.type, mockProfile);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[#181a1f] border border-[#2d3139] rounded-3xl w-full max-w-lg overflow-hidden text-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#1f232b] border-b border-[#2d3139] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">Call Logs & WebRTC History</h3>
              <p className="text-[11px] text-slate-400">Incoming, outgoing & missed call records</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                onClick={() => callHistoryService.clearLogs()}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition flex items-center gap-1 text-xs"
                title="Clear Call History"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Logs List */}
        <div className="p-4 overflow-y-auto flex-1 divide-y divide-[#2d3139]/50">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Phone className="w-10 h-10 mx-auto text-slate-600 animate-pulse" />
              <p className="text-xs font-bold text-slate-300">No Call History Yet</p>
              <p className="text-[11px] text-slate-500">Audio and video calls will appear here automatically.</p>
            </div>
          ) : (
            logs.map((log) => {
              const isMissed = log.direction === 'missed';
              const isIncoming = log.direction === 'incoming';

              return (
                <div key={log.id} className="py-3 px-2 flex items-center justify-between hover:bg-[#2d3139]/40 rounded-2xl transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={log.peerAvatar}
                      alt={log.peerName}
                      className="w-10 h-10 rounded-full object-cover border border-[#2d3139] bg-slate-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{log.peerName}</h4>
                      <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                        {isMissed ? (
                          <span className="flex items-center gap-1 text-red-400 font-bold">
                            <PhoneMissed className="w-3 h-3" /> Missed
                          </span>
                        ) : isIncoming ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-bold">
                            <PhoneIncoming className="w-3 h-3" /> Incoming
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-blue-400 font-bold">
                            <PhoneOutgoing className="w-3 h-3" /> Outgoing
                          </span>
                        )}

                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400 font-mono">{formatTime(log.timestamp)}</span>
                        
                        {!isMissed && (
                          <>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-300 font-mono flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5 text-slate-400" /> {formatDuration(log.durationSeconds)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Call Back Button */}
                  <button
                    onClick={() => handleCallBack(log)}
                    className="p-2.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl border border-emerald-500/30 transition shadow-xs flex items-center gap-1.5 text-xs font-bold shrink-0 ml-2"
                    title={`Call back ${log.peerName}`}
                  >
                    {log.type === 'video' ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                    <span className="hidden xs:inline">Call</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
