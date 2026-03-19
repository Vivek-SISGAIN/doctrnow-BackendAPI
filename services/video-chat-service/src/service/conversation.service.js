const mongoose = require("mongoose");
const Conversation = require("../models/conversation.model");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

// MongoDB duplicate key error code
const DUPLICATE_KEY_ERROR_CODE = 11000;

/**
 * Creates a conversation for a consultation, or returns the existing one.
 *
 * Idempotent: exactly one conversation per consultationId.
 * Handles race conditions via duplicate key error catch-and-fetch.
 *
 * @param {string} consultationId
 * @param {string} doctorId
 * @param {string} patientId
 * @param {string} [patientName]
 * @param {string} [patientAvatar]
 * @returns {Promise<Object>} conversation document (plain object)
 */
const createConversationForConsultation = async (consultationId, doctorId, patientId, patientName, patientAvatar) => {
    // Input validation
    if (!consultationId) {
        throw ApiError.badRequest("consultationId is required");
    }
    if (!patientId || !doctorId) {
        throw ApiError.badRequest(
            `Cannot create conversation without both patientId and doctorId. Got: patientId=${patientId}, doctorId=${doctorId}`
        );
    }

    // 1. Check if conversation already exists
    const existing = await Conversation.findOne({ consultationId }).lean();

    if (existing) {
        logger.info("Conversation already exists for consultation", {
            consultationId,
            conversationId: existing._id
        });
        return existing;
    }

    // 2. Attempt to create new conversation
    try {
        const conversation = await Conversation.create({
            consultationId,
            type: "GROUP",
            participants: [
                { userId: doctorId, role: "DOCTOR" },
                { userId: patientId, role: "PATIENT" }
            ],
            patientName,
            patientAvatar,
            chatState: "SCHEDULED",
            // Part 1: Set lastMessageAt = createdAt so new conversations sort
            // correctly in the inbox cursor pagination (lastMessageAt DESC).
            lastMessageAt: new Date()
        });

        logger.info("Conversation created for consultation", {
            consultationId,
            conversationId: conversation._id
        });

        // Re-fetch as lean for consistent plain-object return
        return await Conversation.findById(conversation._id).lean();
    } catch (error) {
        // 3. Handle race condition: another request created it between our check and insert
        if (error.code === DUPLICATE_KEY_ERROR_CODE) {
            logger.warn("Duplicate conversation creation attempted, fetching existing", {
                consultationId
            });

            const existing = await Conversation.findOne({ consultationId }).lean();

            if (existing) {
                return existing;
            }
        }

        // Unexpected error — rethrow
        throw error;
    }
};

/**
 * Fetches conversation by consultationId.
 * Throws 404 if not found.
 *
 * @param {string} consultationId
 * @returns {Promise<Object>} conversation document (plain object)
 */
const getConversationByConsultationId = async (consultationId) => {
    const conversation = await Conversation.findOne({ consultationId }).lean();

    if (!conversation) {
        throw ApiError.notFound(
            `Conversation not found for consultation: ${consultationId}`
        );
    }

    return conversation;
};

/**
 * Validates that a user is an active participant of the conversation.
 * Active = exists in participants array AND has not left (leftAt is null or absent).
 *
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<Object>} conversation document with projected fields
 */
const validateParticipantAccess = async (conversationId, userId) => {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw ApiError.badRequest(`Invalid conversationId: ${conversationId}`);
    }

    const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: {
            $elemMatch: {
                userId,
                $or: [
                    { leftAt: null },
                    { leftAt: { $exists: false } }
                ]
            }
        }
    })
        .select("_id participants chatState")
        .lean();

    if (!conversation) {
        throw ApiError.forbidden(
            "User is not an active participant of this conversation"
        );
    }

    return conversation;
};

/**
 * Updates a participant's userId within a conversation.
 * Idempotent: skips update if oldUserId and newUserId are the same.
 *
 * @param {string} consultationId
 * @param {string} oldUserId
 * @param {string} newUserId
 */
const updateParticipantUserId = async (consultationId, oldUserId, newUserId) => {
    if (!oldUserId || !newUserId || oldUserId === newUserId) {
        logger.info("Skipping participant userId update (idempotent or missing IDs)", {
            consultationId,
            oldUserId,
            newUserId
        });
        return;
    }

    const result = await Conversation.updateOne(
        { consultationId, "participants.userId": oldUserId },
        { $set: { "participants.$.userId": newUserId } }
    );

    if (result.modifiedCount > 0) {
        logger.info("Updated participant userId in conversation", {
            consultationId,
            oldUserId,
            newUserId
        });
    } else {
        logger.warn("No participant updated (oldUserId not found in conversation?)", {
            consultationId,
            oldUserId
        });
    }
};

module.exports = {
    createConversationForConsultation,
    getConversationByConsultationId,
    validateParticipantAccess,
    updateParticipantUserId
};
