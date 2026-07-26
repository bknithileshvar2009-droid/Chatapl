import CryptoJS from 'crypto-js';

/**
 * Derive a shared secret channel key for a room
 */
export function getRoomChannelKey(roomId: string): string {
  return CryptoJS.SHA256(`nexus_aes_secret_channel_key_${roomId}`).toString();
}

/**
 * Encrypt message text on the device before committing to Firestore or local storage.
 */
export function encryptMessage(text: string, secretKey: string): string {
  if (!text) return '';
  try {
    const encrypted = CryptoJS.AES.encrypt(text, secretKey).toString();
    return `[AES_ENC]:${encrypted}`;
  } catch (err) {
    console.error('AES Encryption error:', err);
    return text;
  }
}

/**
 * Decrypt message text strictly on the receiver's device using the shared secret key.
 */
export function decryptMessage(cipherText: string, secretKey: string): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith('[AES_ENC]:')) {
    // Return unencrypted/legacy plain text
    return cipherText;
  }
  try {
    const rawCipher = cipherText.substring(10);
    const bytes = CryptoJS.AES.decrypt(rawCipher, secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || cipherText;
  } catch (err) {
    console.error('AES Decryption error:', err);
    return cipherText;
  }
}
