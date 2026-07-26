import React, { useState } from 'react';
import { QrCode, Monitor, Smartphone, ShieldCheck, LogOut, CheckCircle, RefreshCw, X, Laptop } from 'lucide-react';
import { useDevicePairing, DeviceSession } from '../hooks/useDevicePairing';
import { Profile } from '../types';

interface Props {
  currentUser: Profile;
  isOpen: boolean;
  onClose: () => void;
}

export const CompanionSyncModal: React.FC<Props> = ({ currentUser, isOpen, onClose }) => {
  const { sessions, qrCodeChallenge, generateNewQrChallenge, confirmQrPairing, revokeSession } = useDevicePairing(currentUser.id);
  const [activeTab, setActiveTab] = useState<'qr' | 'sessions'>('qr');
  const [pairedSuccess, setPairedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSimulateScan = () => {
    confirmQrPairing(qrCodeChallenge);
    setPairedSuccess(true);
    setTimeout(() => {
      setPairedSuccess(false);
      setActiveTab('sessions');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[#181a1f] border border-[#2d3139] rounded-3xl w-full max-w-md overflow-hidden text-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#1f232b] border-b border-[#2d3139] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-extrabold text-white">WhatsApp Web & Companion Sync</h3>
              <p className="text-[10px] text-slate-400">Pair desktop web browsers & manage active sessions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#2d3139] bg-[#121418] shrink-0">
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'qr' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" /> Pair Web Companion
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex-1 py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'sessions' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" /> Active Sessions ({sessions.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'qr' ? (
            <div className="text-center space-y-4">
              {pairedSuccess ? (
                <div className="py-8 space-y-2 animate-in zoom-in">
                  <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto animate-bounce" />
                  <h4 className="text-base font-bold text-white">Device Pair Successful!</h4>
                  <p className="text-xs text-slate-400">IndexedDB state delta synchronized securely.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-300 max-w-xs mx-auto">
                    Scan this QR code from web.whatsapp.com to pair this account with E2EE sync.
                  </p>

                  {/* QR Code Card */}
                  <div className="w-52 h-52 bg-white p-4 rounded-2xl mx-auto shadow-2xl border-4 border-emerald-500/40 relative flex flex-col items-center justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeChallenge)}`}
                      alt="Companion Pair QR Code"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                      <ShieldCheck className="w-20 h-20 text-emerald-600 animate-pulse" />
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                      Challenge Token: {qrCodeChallenge.substring(0, 18)}...
                    </span>
                    <button
                      onClick={generateNewQrChallenge}
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
                      title="Refresh QR Code"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={handleSimulateScan}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-md transition"
                  >
                    Simulate Camera QR Scan & Pair
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Logged In Devices</span>
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3 bg-[#0f1115] border border-[#2d3139] rounded-2xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-slate-800 rounded-xl text-emerald-400">
                      {sess.isCurrentDevice ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-white truncate">{sess.deviceName}</h4>
                        {sess.isCurrentDevice && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold rounded">THIS DEVICE</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">{sess.browser} • {sess.os}</p>
                      <p className="text-[9px] text-slate-500 font-mono">{sess.ipLocation}</p>
                    </div>
                  </div>

                  {!sess.isCurrentDevice && (
                    <button
                      onClick={() => revokeSession(sess.id)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-xl transition shrink-0"
                      title="Remote Log Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
