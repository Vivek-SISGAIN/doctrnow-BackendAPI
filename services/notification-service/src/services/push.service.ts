import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

if (!admin.apps.length) {
  try {
    const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountStr) {
      const serviceAccount = JSON.parse(serviceAccountStr);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin Initialized');
    } else {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT not found in environment');
    }
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
  }
}

export class PushService {
  async sendPushNotification(userId: string, title: string, body: string, data?: any) {
    if (!admin.apps.length) {
      console.warn('[PushService] Firebase not initialized. Skipping push.');
      return;
    }

    try {
      const devices = await prisma.userDevice.findMany({
        where: { userId },
      });

      if (devices.length === 0) {
        console.log(`[PushService] No devices found for userId: ${userId}`);
        return;
      }

      const tokens = devices.map((d) => d.fcmToken);

      const message = {
        notification: { title, body },
        data: data ? { payload: JSON.stringify(data) } : {}, // data values must be strings
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message as any);
      
      console.log(`[PushService] Successfully sent ${response.successCount} messages`);

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errCode = resp.error?.code;
            if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
              failedTokens.push(tokens[idx]);
            }
          }
        });

        if (failedTokens.length > 0) {
          await prisma.userDevice.deleteMany({
            where: {
              fcmToken: { in: failedTokens },
            },
          });
          console.log(`[PushService] Cleaned up ${failedTokens.length} invalid tokens`);
        }
      }

      return response;
    } catch (error) {
      console.error(`[PushService] Error sending push notification:`, error);
      throw error;
    }
  }
}

export const pushService = new PushService();
