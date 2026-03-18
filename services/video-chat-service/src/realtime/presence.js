const { redisClient } = require("../config/redis");

const PRESENCE_PREFIX = "presence";

/**
 * Redis key for a conversation's presence set.
 * @param {string} conversationId
 * @returns {string}
 */
const presenceKey = (conversationId) => `${PRESENCE_PREFIX}:${conversationId}`;

/**
 * Adds a userId to the presence set for a conversation.
 *
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<void>}
 */
const addPresence = async (conversationId, userId) => {
    await redisClient.sAdd(presenceKey(conversationId), userId);
};

/**
 * Removes a userId from the presence set for a conversation.
 *
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<void>}
 */
const removePresence = async (conversationId, userId) => {
    await redisClient.sRem(presenceKey(conversationId), userId);
};

/**
 * Returns the set of online userIds for a conversation.
 *
 * @param {string} conversationId
 * @returns {Promise<string[]>} array of userId strings
 */
const getPresence = async (conversationId) => {
    return await redisClient.sMembers(presenceKey(conversationId));
};

module.exports = { addPresence, removePresence, getPresence };
