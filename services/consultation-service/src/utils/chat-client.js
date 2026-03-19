const logger = console; // Use console as logger since no winston/pino is present in consultation-service

const VIDEO_CHAT_SERVICE_URL = process.env.VIDEO_CHAT_SERVICE_URL || 'http://localhost:3007';

/**
 * Internal client for communicating with video-chat-service.
 * Uses Node 18+ global fetch.
 */
class ChatClient {
  /**
   * Creates (or returns existing) chat session for a consultation.
   * Idempotent.
   */
  async createSession(consultationId, patientId, doctorId, patientName, patientAvatar) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${VIDEO_CHAT_SERVICE_URL}/api/chat/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, patientId, doctorId, patientName, patientAvatar }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.json();
        logger.warn('Chat session create failed', { consultationId, error });
        return null;
      }

      return await response.json();
    } catch (err) {
      logger.warn('Chat service unreachable during createSession', { consultationId, error: err.message });
      return null;
    }
  }

  /**
   * Starts a chat session (transitions to ACTIVE).
   */
  async startSession(consultationId) {
    try {
      const response = await fetch(`${VIDEO_CHAT_SERVICE_URL}/api/chat/session/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId }),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error(`[ChatClient] startSession failed:`, error);
        return null;
      }

      return await response.json();
    } catch (err) {
      logger.error(`[ChatClient] startSession error:`, err.message);
      return null;
    }
  }

  /**
   * Ends a chat session (transitions to COMPLETED).
   */
  async endSession(consultationId, endStatus = 'COMPLETED') {
    try {
      const response = await fetch(`${VIDEO_CHAT_SERVICE_URL}/api/chat/session/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultationId, endStatus }),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error(`[ChatClient] endSession failed:`, error);
        return null;
      }

      return await response.json();
    } catch (err) {
      logger.error(`[ChatClient] endSession error:`, err.message);
      return null;
    }
  }

  /**
   * Updates a participant's userId in a conversation (internal).
   */
  async updateParticipantUserId(consultationId, oldUserId, newUserId) {
    try {
      const response = await fetch(`${VIDEO_CHAT_SERVICE_URL}/api/chat/session/update-participant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SECRET
        },
        body: JSON.stringify({ consultationId, oldUserId, newUserId }),
      });

      if (!response.ok) {
        const error = await response.json();
        logger.warn('[ChatClient] updateParticipantUserId failed', { consultationId, error });
        return false;
      }

      return true;
    } catch (err) {
      logger.error('[ChatClient] updateParticipantUserId error:', err.message);
      return false;
    }
  }
}

module.exports = new ChatClient();
