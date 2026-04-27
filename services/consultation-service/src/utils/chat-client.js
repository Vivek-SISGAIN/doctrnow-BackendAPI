const logger = console; // Use console as logger since no winston/pino is present in consultation-service

const API_GATEWAY_URL = process.env.BASE_URL || process.env.API_GATEWAY_URL || 'http://localhost:8080/api/v1/';
const gatewayBaseUrl = () => API_GATEWAY_URL.endsWith('/') ? API_GATEWAY_URL : `${API_GATEWAY_URL}/`;

const internalHeaders = () => ({
  'Content-Type': 'application/json',
  ...(process.env.INTERNAL_SERVICE_SECRET
    ? { 'x-internal-service-key': process.env.INTERNAL_SERVICE_SECRET }
    : {}),
  ...(process.env.INTERNAL_SECRET ? { 'x-internal-secret': process.env.INTERNAL_SECRET } : {}),
});

/**
 * Internal client for communicating with video-chat-service.
 * Uses Node 18+ global fetch.
 */
class ChatClient {
  /**
   * Creates (or returns existing) chat session for a consultation.
   * Idempotent.
   */
  async createSession({
    consultationId,
    patientId,
    doctorId,
    patientName,
    patientAvatar,
    appointmentId,
    appointmentDate,
    appointmentType
  }) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${gatewayBaseUrl()}chat/session/create`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({
          consultationId,
          patientId,
          doctorId,
          patientName,
          patientAvatar,
          appointmentId,
          appointmentDate,
          appointmentType
        }),
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
      const response = await fetch(`${gatewayBaseUrl()}chat/session/start`, {
        method: 'POST',
        headers: internalHeaders(),
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
  async endSession(consultationId, endStatus = 'COMPLETED', postMessageLimit = 5) {
    try {
      const response = await fetch(`${gatewayBaseUrl()}chat/session/end`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({ consultationId, endStatus, postMessageLimit }),
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
      const response = await fetch(`${gatewayBaseUrl()}chat/session/update-participant`, {
        method: 'POST',
        headers: internalHeaders(),
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
