import { Message, QueuedMessageItem } from '../types';

const QUEUE_STORAGE_KEY = 'apex_offline_message_queue';

export type NetworkStatusListener = (isOnline: boolean, queuedCount: number) => void;

export class OfflineSyncService {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: Set<NetworkStatusListener> = new Set();

  constructor() {
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
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  public enqueueMessage(chatId: string, message: Message): QueuedMessageItem {
    const queue = this.getQueue();
    const item: QueuedMessageItem = {
      id: 'queue_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      chatId,
      message: { ...message, status: 'queued', is_queued_offline: true },
      queuedAt: new Date().toISOString()
    };
    queue.push(item);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    this.notifyListeners();
    return item;
  }

  public removeFromQueue(queueItemId: string): void {
    const queue = this.getQueue().filter((item) => item.id !== queueItemId);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    this.notifyListeners();
  }

  public clearQueue(): void {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
    this.notifyListeners();
  }

  private flushCallback?: (item: QueuedMessageItem) => Promise<boolean>;

  public setFlushHandler(handler: (item: QueuedMessageItem) => Promise<boolean>) {
    this.flushCallback = handler;
  }

  public async flushQueue(): Promise<void> {
    if (!this.isOnline || !this.flushCallback) return;

    const queue = this.getQueue();
    if (queue.length === 0) return;

    console.log(`⚡ [OfflineSync] Flushing ${queue.length} offline queued messages...`);
    for (const item of queue) {
      try {
        const success = await this.flushCallback(item);
        if (success) {
          this.removeFromQueue(item.id);
        }
      } catch (err) {
        console.error('Failed to flush offline message:', err);
      }
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
