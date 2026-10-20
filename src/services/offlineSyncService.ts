import { Message, QueuedMessageItem } from '../types';
import { safeStorage } from '../utils/safeStorage';
import { firebaseAuthService } from './firebaseAuthService';

const QUEUE_STORAGE_KEY = 'apex_offline_message_queue';

export type NetworkStatusListener = (isOnline: boolean, queuedCount: number) => void;

export class OfflineSyncService {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: Set<NetworkStatusListener> = new Set();
  private flushCallback?: (item: QueuedMessageItem) => Promise<boolean>;
  private isFlushing: boolean = false;

  constructor() {
    // Default flush handler with Firestore
    this.flushCallback = async (item: QueuedMessageItem) => {
      try {
        const { chatId, message } = item;
        await firebaseAuthService.sendFirestoreMessage(
          chatId,
          message.sender_id,
          message.content,
          message.type || 'text',
          message.attachment_url,
          message.reply_to_id,
          message.audio_duration
        );
        return true;
      } catch (err: any) {
        console.warn('⚡ [OfflineSync] Sync failed, will retry when online:', err?.message || err);
        return false;
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notifyListeners();
        this.flushQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyListeners();
      });
    }
  }

  public getIsOnline(): boolean {
    if (typeof navigator !== 'undefined') {
      this.isOnline = navigator.onLine;
    }
    return this.isOnline;
  }

  public subscribe(listener: NetworkStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.isOnline, this.getQueue().length);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const count = this.getQueue().length;
    this.listeners.forEach((listener) => listener(this.isOnline, count));
  }

  public getQueue(): QueuedMessageItem[] {
    try {
      const stored = safeStorage.getItem(QUEUE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public enqueueMessage(chatId: string, message: Message): QueuedMessageItem {
    const queue = this.getQueue();
    const existingIndex = queue.findIndex((item) => item.message.id === message.id);
    const item: QueuedMessageItem = {
      id: 'queue_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      chatId,
      message: { ...message, status: 'queued', is_queued_offline: true },
      queuedAt: new Date().toISOString()
    };
    if (existingIndex >= 0) {
      queue[existingIndex] = item;
    } else {
      queue.push(item);
    }
    safeStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    this.notifyListeners();

    if (this.isOnline) {
      setTimeout(() => this.flushQueue(), 300);
    }

    return item;
  }

  public removeFromQueue(queueItemId: string): void {
    const queue = this.getQueue().filter((item) => item.id !== queueItemId);
    safeStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    this.notifyListeners();
  }

  public clearQueue(): void {
    safeStorage.removeItem(QUEUE_STORAGE_KEY);
    this.notifyListeners();
  }

  public setFlushHandler(handler: (item: QueuedMessageItem) => Promise<boolean>) {
    this.flushCallback = handler;
    if (this.isOnline && this.getQueue().length > 0) {
      this.flushQueue();
    }
  }

  public async flushQueue(): Promise<void> {
    if (!this.isOnline || !this.flushCallback || this.isFlushing) return;

    const queue = this.getQueue();
    if (queue.length === 0) return;

    this.isFlushing = true;
    console.log(`⚡ [OfflineSync] Auto-flushing ${queue.length} offline queued message(s)...`);

    for (const item of queue) {
      try {
        const success = await this.flushCallback(item);
        if (success) {
          this.removeFromQueue(item.id);
        } else {
          break;
        }
      } catch (err) {
        console.error('Failed to flush offline message:', err);
        break;
      }
    }
    this.isFlushing = false;
  }
}

export const offlineSyncService = new OfflineSyncService();
