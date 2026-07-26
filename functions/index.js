const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Cloud Function triggered on creation of a new message in chats/{chatId}/messages/{messageId}
 * Dispatches background push notifications via FCM to all room participants.
 */
exports.onNewMessageSendNotification = functions.firestore
  .document('chats/{chatId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const { chatId, messageId } = context.params;
    const messageData = snapshot.data();

    if (!messageData) return null;

    const senderId = messageData.sender_id || messageData.senderId;
    const rawContent = messageData.content || 'New message';

    try {
      // 1. Fetch parent chat room document to retrieve participants
      const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
      if (!chatDoc.exists) return null;

      const chatData = chatDoc.data();
      const participants = chatData.participants || [];

      // 2. Exclude sender from notification targets
      const recipientIds = participants.filter(id => id !== senderId);
      if (recipientIds.length === 0) return null;

      // 3. Fetch sender profile for display name
      let senderName = 'New Message';
      if (senderId) {
        const senderDoc = await admin.firestore().collection('users').doc(senderId).get();
        if (senderDoc.exists) {
          const u = senderDoc.data();
          senderName = u.display_name || (u.username ? `@${u.username}` : senderName);
        }
      }

      // 4. Collect FCM registration tokens stored in users/{uid}/fcmTokens
      const tokens = [];
      for (const recipientId of recipientIds) {
        const userDoc = await admin.firestore().collection('users').doc(recipientId).get();
        if (userDoc.exists) {
          const userFcmTokens = userDoc.data().fcmTokens;
          if (Array.isArray(userFcmTokens)) {
            tokens.push(...userFcmTokens);
          }
        }
      }

      if (tokens.length === 0) {
        console.log(`No FCM tokens found for recipients in room ${chatId}`);
        return null;
      }

      // Decrypt or mask notification body preview
      const notificationBody = rawContent.startsWith('[AES_ENC]:')
        ? '🔒 Encrypted message'
        : rawContent;

      // 5. Dispatch background push notification via FCM Multicast API
      const payload = {
        notification: {
          title: senderName,
          body: notificationBody,
        },
        data: {
          chatId,
          messageId,
          senderId: senderId || ''
        },
        tokens: Array.from(new Set(tokens)) // Deduplicate tokens
      };

      const response = await admin.messaging().sendEachForMulticast(payload);
      console.log(`FCM Notifications sent: ${response.successCount} succeeded, ${response.failureCount} failed.`);
      return response;
    } catch (error) {
      console.error('Error in onNewMessageSendNotification function:', error);
      return null;
    }
  });
