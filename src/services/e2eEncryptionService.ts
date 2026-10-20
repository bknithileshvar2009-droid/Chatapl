import CryptoJS from 'crypto-js';
import { E2EKeyPair, EphemeralTimer, Message } from '../types';
import { safeStorage } from '../utils/safeStorage';

const KEY_PREFIX = 'apex_e2e_keypair_';

export class E2EEncryptionService {
  /**
   * Retrieves or generates a local device key pair for E2EE messaging
   */
  async getOrCreateUserKeyPair(userId: string): Promise<E2EKeyPair> {
    const storageKey = `${KEY_PREFIX}${userId}`;
    const existing = safeStorage.getItem(storageKey);
    if (existing) {
      try {
        return JSON.parse(existing);
      } catch {
        // Fallback to regenerate
      }
    }

    // Generate random keys for demo AES-256 E2EE layer
    const privateKey = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
    const publicKey = CryptoJS.SHA256(privateKey + '_pub_' + userId).toString(CryptoJS.enc.Hex);

    const keyPair: E2EKeyPair = { publicKey, privateKey };
    safeStorage.setItem(storageKey, JSON.stringify(keyPair));
    return keyPair;
  }

  /**
   * Encrypts message content client-side using symmetric AES-256 key
   */
  encryptMessage(plainText: string, secretKeyStr: string = 'apex_e2e_master_secret'): { ciphertext: string; displayPayload: string } {
    if (!plainText) return { ciphertext: '', displayPayload: '' };
    try {
      const encrypted = CryptoJS.AES.encrypt(plainText, secretKeyStr).toString();
      return {
        ciphertext: encrypted,
        displayPayload: `🔒 [E2EE Encrypted]: ${encrypted.substring(0, 24)}...`
      };
    } catch (e) {
      console.error('Encryption failed:', e);
      return { ciphertext: plainText, displayPayload: plainText };
    }
  }

  /**
   * Decrypts ciphertext client-side
   */
  decryptMessage(ciphertext: string, secretKeyStr: string = 'apex_e2e_master_secret'): string {
    if (!ciphertext) return '';
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, secretKeyStr);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);
      return originalText || ciphertext;
    } catch {
      return ciphertext;
    }
  }

  /**
   * Calculate Ephemeral / Disappearing message expiration date string
   */
  calculateEphemeralExpiration(timer: EphemeralTimer): string | undefined {
    if (timer === 'off') return undefined;

    const now = new Date();
    if (timer === '24h') {
      now.setHours(now.getHours() + 24);
    } else if (timer === '7d') {
      now.setDate(now.getDate() + 7);
    } else if (timer === '90d') {
      now.setDate(now.getDate() + 90);
    }
    return now.toISOString();
  }

  /**
   * Check if a message has expired based on ephemeral timer
   */
  isMessageExpired(message: Message): boolean {
    if (!message.expires_at) return false;
    const expiresDate = new Date(message.expires_at).getTime();
    return Date.now() > expiresDate;
  }
}

export const e2eEncryptionService = new E2EEncryptionService();
