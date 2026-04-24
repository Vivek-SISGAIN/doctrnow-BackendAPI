import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing Firebase environment variables");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });

    console.log("✅ Firebase Admin Initialized");
  } catch (error) {
    console.error("❌ Error initializing Firebase Admin:", error);
  }
}

export class PushService {
  async sendPushNotification(userId: string, title: string, body: string, data?: any) {
    if (!admin.apps.length) {
      const err = new Error('[PushService] Firebase not initialized. Skipping push.');
      (err as any).code = 'FIREBASE_NOT_INITIALIZED';
      throw err;
    }

    try {
      const devices = await prisma.userDevice.findMany({
        where: { userId },
      });

      if (devices.length === 0) {
        // Treat "no devices" as a retryable condition (device may register later).
        // The worker will handle retries / max-retries and update notification status accordingly.
        const err = new Error(`[PushService] No devices found for userId: ${userId}`);
        (err as any).code = 'NO_DEVICES';
        throw err;
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
            if (
              errCode === 'messaging/invalid-registration-token' ||
              errCode === 'messaging/registration-token-not-registered'
            ) {
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
      if ((error as any)?.code === 'NO_DEVICES') {
        // Expected: user hasn't registered a push device. Socket already delivered in-app.
        // Worker will silently ack this, so we log at warn, not error.
        console.warn(String((error as Error).message || error));
      } else {
        console.error(`[PushService] Error sending push notification:`, error);
      }
      throw error;
    }
  }
}

export const pushService = new PushService();
