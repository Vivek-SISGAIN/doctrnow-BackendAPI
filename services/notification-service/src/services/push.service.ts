import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

if (!admin.apps.length) {
  try {
    let serviceAccount: admin.ServiceAccount | null = null;

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const serviceAccountStr  = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (serviceAccountPath) {
      // Most reliable: read from a JSON file
      // Set FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json in .env
      const resolved = path.resolve(process.cwd(), serviceAccountPath);
      serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    } else if (serviceAccountStr) {
      // Fallback: inline JSON string from env
      // .env parsers often corrupt multiline values — clean it up first
      const cleaned = serviceAccountStr
        .trim()
        .replace(/\\n/g, '\n'); // restore real newlines in the private_key PEM block
      serviceAccount = JSON.parse(cleaned);
    }

    if (serviceAccount) {
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
