import { safeStorage } from '../utils/safeStorage';

export interface CallLog {
  id: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  timestamp: string;
  durationSeconds: number;
}

const CALL_HISTORY_STORAGE_KEY = 'whatsapp_call_history_prod';

type Listener = (logs: CallLog[]) => void;

class CallHistoryService {
  private listeners: Set<Listener> = new Set();

  constructor() {
    if (!safeStorage.getItem(CALL_HISTORY_STORAGE_KEY)) {
      safeStorage.setItem(CALL_HISTORY_STORAGE_KEY, JSON.stringify([]));
    }
  }

  public getLogs(): CallLog[] {
    try {
      const data = safeStorage.getItem(CALL_HISTORY_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public addLog(log: Omit<CallLog, 'id'>): CallLog {
    const newLog: CallLog = {
      ...log,
      id: 'call-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    };

    const logs = this.getLogs();
    logs.unshift(newLog);
    
    // Keep max 100 calls
    const trimmed = logs.slice(0, 100);
    safeStorage.setItem(CALL_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    this.notify();
    return newLog;
  }

  public clearLogs() {
    safeStorage.setItem(CALL_HISTORY_STORAGE_KEY, JSON.stringify([]));
    this.notify();
  }

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.getLogs());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify() {
    const current = this.getLogs();
    this.listeners.forEach((fn) => fn(current));
  }
}

export const callHistoryService = new CallHistoryService();
