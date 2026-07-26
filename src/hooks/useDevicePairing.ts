import { useState, useEffect } from 'react';

export interface DeviceSession {
  id: string;
  deviceName: string;
  browser: string;
  os: string;
  ipLocation: string;
  pairedAt: string;
  isCurrentDevice: boolean;
}

export function useDevicePairing(userId: string | undefined) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [qrCodeChallenge, setQrCodeChallenge] = useState<string>('');

  useEffect(() => {
    if (!userId) return;

    // Initial default sessions
    const initialSessions: DeviceSession[] = [
      {
        id: 'session_macbook_pro',
        deviceName: 'MacBook Pro 16" (Web Sync)',
        browser: 'Chrome 126.0',
        os: 'macOS Sonoma',
        ipLocation: 'San Francisco, CA, USA',
        pairedAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
        isCurrentDevice: false
      },
      {
        id: 'session_this_mobile',
        deviceName: 'Apex Mobile Client',
        browser: 'Safari Mobile / PWA Engine',
        os: 'iOS 18.2 / Android 15',
        ipLocation: 'Active Session',
        pairedAt: new Date().toISOString(),
        isCurrentDevice: true
      }
    ];

    setSessions(initialSessions);
    generateNewQrChallenge();
  }, [userId]);

  const generateNewQrChallenge = () => {
    const challenge = 'APEX_PAIR_' + Math.random().toString(36).substring(2, 10).toUpperCase() + '_' + Date.now();
    setQrCodeChallenge(challenge);
  };

  const confirmQrPairing = (challengeToken: string) => {
    const newSession: DeviceSession = {
      id: 'session_' + Date.now(),
      deviceName: 'Companion Web Browser',
      browser: 'Chrome Web Engine',
      os: 'Windows 11 Pro',
      ipLocation: 'Authenticated Companion',
      pairedAt: new Date().toISOString(),
      isCurrentDevice: false
    };

    setSessions(prev => [newSession, ...prev]);
    generateNewQrChallenge();
    return newSession;
  };

  const revokeSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  return {
    sessions,
    qrCodeChallenge,
    generateNewQrChallenge,
    confirmQrPairing,
    revokeSession
  };
}
