import { 
  collection, addDoc, getDocs, onSnapshot, query, where, doc, updateDoc, arrayUnion, deleteDoc 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserStatusStory } from '../types';

export class StatusStoryService {
  /**
   * Post a new Status / Story
   */
  public async createStatus(
    userId: string,
    userName: string,
    userAvatar: string,
    type: 'image' | 'text' | 'video',
    mediaUrl?: string,
    caption?: string,
    bgColor?: string,
    musicTitle?: string,
    musicArtist?: string,
    musicUrl?: string,
    storagePath?: string
  ): Promise<string> {
    const statusesCol = collection(db, 'statuses');
    const docRef = await addDoc(statusesCol, {
      userId,
      userName,
      userAvatar: userAvatar || '',
      type,
      mediaUrl: mediaUrl || null,
      caption: caption || '',
      bgColor: bgColor || '#0f172a',
      createdAt: new Date().toISOString(),
      viewers: [userId],
      musicTitle: musicTitle || null,
      musicArtist: musicArtist || null,
      musicUrl: musicUrl || null,
      storagePath: storagePath || null
    });
    return docRef.id;
  }

  /**
   * Subscribe to all active statuses created within the last 24 hours
   */
  public subscribeToActiveStatuses(onUpdate: (statuses: UserStatusStory[]) => void) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const statusesCol = collection(db, 'statuses');
    const q = query(statusesCol, where('createdAt', '>=', twentyFourHoursAgo));

    return onSnapshot(q, (snapshot) => {
      const list: UserStatusStory[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          userId: data.userId,
          userName: data.userName || 'User',
          userAvatar: data.userAvatar || '',
          mediaUrl: data.mediaUrl || undefined,
          caption: data.caption || '',
          type: data.type || 'text',
          bgColor: data.bgColor || '#0f172a',
          createdAt: data.createdAt,
          viewers: data.viewers || [],
          musicTitle: data.musicTitle || undefined,
          musicArtist: data.musicArtist || undefined,
          musicUrl: data.musicUrl || undefined,
          storagePath: data.storagePath || undefined
        });
      });
      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(list);
    }, (err) => console.error('Status subscription error:', err));
  }

  /**
   * Mark a status story as viewed by current user
   */
  public async markStatusAsViewed(statusId: string, currentUserId: string) {
    try {
      const statusRef = doc(db, 'statuses', statusId);
      await updateDoc(statusRef, {
        viewers: arrayUnion(currentUserId)
      });
    } catch (e) {
      console.error('Error marking status viewed:', e);
    }
  }

  /**
   * Cleanup statuses older than 24 hours
   */
  public async cleanupExpiredStatuses() {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const statusesCol = collection(db, 'statuses');
      const snapshot = await getDocs(statusesCol);
      snapshot.forEach(async (docSnap) => {
        const data = docSnap.data();
        if (data.createdAt < twentyFourHoursAgo) {
          await deleteDoc(doc(db, 'statuses', docSnap.id)).catch(() => {});
        }
      });
    } catch (e) {
      console.error('Status cleanup error:', e);
    }
  }
}

export const statusStoryService = new StatusStoryService();
