import React, { useState, useRef, useEffect } from 'react';
import { QrCode, Monitor, Smartphone, ShieldCheck, LogOut, CheckCircle, RefreshCw, X, Laptop, Camera, StopCircle, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useDevicePairing } from '../hooks/useDevicePairing';
import { Profile } from '../types';

interface Props {
  currentUser: Profile;
  isOpen: boolean;
  onClose: () => void;
}

// Dynamically load html5-qrcode script from CDN if fallback needed
const loadHtml5QrcodeCdn = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Html5Qrcode) {
      resolve((window as any).Html5Qrcode);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/html5-qrcode';
    script.async = true;
    script.onload = () => resolve((window as any).Html5Qrcode);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
};

export const CompanionSyncModal: React.FC<Props> = ({ currentUser, isOpen, onClose }) => {
  const { sessions, qrCodeChallenge, generateNewQrChallenge, confirmQrPairing, revokeSession } = useDevicePairing(currentUser.id);
  const [activeTab, setActiveTab] = useState<'qr' | 'sessions'>('qr');
  const [pairedSuccess, setPairedSuccess] = useState(false);
  const [scannedToken, setScannedToken] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const qrCodeInstanceRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const stopCameraScanner = async () => {
    if (qrCodeInstanceRef.current) {
      try {
        await qrCodeInstanceRef.current.stop();
        qrCodeInstanceRef.current.clear();
      } catch (err) {
        console.warn('Scanner cleanup warning:', err);
      } finally {
        qrCodeInstanceRef.current = null;
        setIsScanning(false);
      }
    } else {
      setIsScanning(false);
    }
  };

  const startCameraScanner = async () => {
    setErrorMsg(null);
    setIsScanning(true);

    try {
      let QrClass = Html5Qrcode;
      if (!QrClass) {
        QrClass = await loadHtml5QrcodeCdn();
      }

      await stopCameraScanner();

      // Wait for DOM element to be mounted in React tree
      let attempts = 0;
      let element = document.getElementById('qr-camera-container');
      while (!element && attempts < 20) {
        await new Promise((r) => setTimeout(r, 100));
        element = document.getElementById('qr-camera-container');
        attempts++;
      }

      if (!element) {
        throw new Error('QR Camera display container could not be found in DOM.');
      }

      const scannerInstance = new QrClass('qr-camera-container');
      qrCodeInstanceRef.current = scannerInstance;

      const cameras = await QrClass.getCameras().catch(() => []);
      let cameraConfig: any = { facingMode: 'environment' };
      if (cameras && cameras.length > 0) {
        const backCam = cameras.find((c: any) => 
          c.label.toLowerCase().includes('back') || 
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        );
        cameraConfig = backCam ? backCam.id : cameras[0].id;
      }

      const onScanSuccess = async (decodedText: string) => {
        const cleanToken = decodedText?.trim() || '';
        
        // Validate scanned code format
        const isValidPairingCode = cleanToken.startsWith('APEX_PAIR_') || cleanToken.length >= 8;

        try {
          await scannerInstance.stop();
          scannerInstance.clear();
        } catch (e) {
          console.warn('Error stopping camera:', e);
        }
        qrCodeInstanceRef.current = null;
        setIsScanning(false);

        if (!isValidPairingCode) {
          setErrorMsg('⚠️ Invalid QR Code scanned. Please scan a valid Apex Web Companion QR code.');
          return;
        }

        setScannedToken(cleanToken);
        confirmQrPairing(cleanToken);
        setPairedSuccess(true);
      };

      try {
        await scannerInstance.start(
          cameraConfig,
          { fps: 10, qrbox: { width: 220, height: 220 } },
          onScanSuccess,
          () => {}
        );
      } catch (firstErr) {
        console.warn('Primary camera config failed, trying user camera fallback:', firstErr);
        await scannerInstance.start(
          { facingMode: 'user' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          onScanSuccess,
          () => {}
        );
      }
    } catch (startErr: any) {
      console.error('Camera QR start error:', startErr);
      setErrorMsg(startErr?.message || 'Camera hardware blocked or unavailable. You can also paste a token or simulate scan.');
      setIsScanning(false);
    }
  };

  if (!isOpen) return null;

  const handleSimulateScan = () => {
    stopCameraScanner();
    confirmQrPairing(qrCodeChallenge);
    setScannedToken(qrCodeChallenge);
    setPairedSuccess(true);
  };

  const handleCloseModal = () => {
    stopCameraScanner();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[#181a1f] border border-[#2d3139] rounded-3xl w-full max-w-md overflow-hidden text-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#1f232b] border-b border-[#2d3139] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-extrabold text-white">Nex Chat Web Companion Sync</h3>
              <p className="text-[10px] text-slate-400">Pair desktop web browsers & manage active sessions</p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#2d3139] bg-[#121418] shrink-0">
          <button
            onClick={() => {
              stopCameraScanner();
              setActiveTab('qr');
            }}
            className={`flex-1 py-2.5 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              activeTab === 'qr' ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" /> Pair Web Companion
          </button>
          <button
            onClick={() => {
              stopCameraScanner();
              setActiveTab('sessions');
            }}
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
              {/* "Device Paired" State / UI Banner */}
              {pairedSuccess ? (
                <div className="p-5 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl space-y-3 animate-in zoom-in-95 text-center shadow-lg">
                  <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
                  <div>
                    <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-extrabold text-[10px] rounded-full uppercase tracking-wider">
                      Device Paired
                    </span>
                    <h4 className="text-base font-extrabold text-white mt-1">Device Paired Successfully!</h4>
                    <p className="text-xs text-emerald-200/80 mt-0.5">
                      Companion session authenticated with End-to-End Encryption.
                    </p>
                  </div>

                  {scannedToken && (
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-emerald-500/30 text-[11px] font-mono text-emerald-300 break-all">
                      <span className="text-slate-400 block text-[9px] uppercase font-sans mb-0.5">Pairing Payload Token</span>
                      {scannedToken}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setPairedSuccess(false)}
                      className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
                    >
                      Pair Another Device
                    </button>
                    <button
                      onClick={() => {
                        setPairedSuccess(false);
                        setActiveTab('sessions');
                      }}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition"
                    >
                      View Active Sessions
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-300 max-w-xs mx-auto">
                    Scan a companion QR code using your camera or present this QR code to web.whatsapp.com.
                  </p>

                  {/* Camera Scanner Container or QR Code Display */}
                  {isScanning ? (
                    <div className="space-y-3">
                      <div className="relative w-full h-64 bg-slate-950 rounded-2xl border-2 border-emerald-500/60 overflow-hidden shadow-inner flex flex-col items-center justify-center">
                        <div id="qr-camera-container" className="w-full h-full object-cover"></div>
                        {/* Scanning frame overlay */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                          <div className="w-48 h-48 border-2 border-dashed border-emerald-400 rounded-xl animate-pulse flex items-center justify-center">
                            <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-bounce"></div>
                          </div>
                          <span className="text-[10px] text-emerald-300 font-bold bg-slate-950/80 px-3 py-1 rounded-full mt-2 backdrop-blur-xs">
                            Align QR Code inside frame
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={stopCameraScanner}
                        className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition"
                      >
                        <StopCircle className="w-4 h-4" /> Stop Camera Stream
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* QR Code Display */}
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

                      {/* Error Message if camera failed */}
                      {errorMsg && (
                        <div className="p-2.5 bg-red-950/60 border border-red-500/40 rounded-xl flex items-center gap-2 text-red-200 text-xs text-left">
                          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                          <span>{errorMsg}</span>
                        </div>
                      )}

                      {/* Action Buttons: Camera Scanner & Simulation */}
                      <div className="space-y-2 pt-1">
                        <button
                          onClick={startCameraScanner}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2"
                        >
                          <Camera className="w-4 h-4" /> Scan QR Code with Camera
                        </button>

                        <button
                          onClick={handleSimulateScan}
                          className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl transition"
                        >
                          Simulate QR Code Scan
                        </button>
                      </div>
                    </>
                  )}
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

