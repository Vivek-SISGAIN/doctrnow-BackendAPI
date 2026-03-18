"use strict";

/**
 * Redis sliding-window rate limiter.
 *
 * Algorithm:
 *   - Sorted set key: `ratelimit:msg:{userId}`
 *   - Score = timestamp (epoch ms)
 *   - Each call adds a new entry and removes entries older than the window.
 *   - If count after trim exceeds max, throw 429.
 *
 * Default: 30 messages per 60-second window per user.
 */

const { redisClient } = require("../config/redis");
const ApiError = require("./ApiError");
const logger = require("./logger");

const WINDOW_MS      = 60_000; // 60 seconds
const MAX_PER_WINDOW = 30;
const KEY_TTL_SEC    = 120;    // auto-expire stale keys after 2× window

/**
 * Enforces a per-user sliding-window rate limit on message sends.
 *
 * @param {string} userId
 * @throws {ApiError} 429 if the user exceeds MAX_PER_WINDOW messages in WINDOW_MS
 */
const checkRateLimit = async (userId) => {
    const key = `ratelimit:msg:${userId}`;
    const now  = Date.now();
    const windowStart = now - WINDOW_MS;

    try {
        // Use a pipeline / multi so all 4 commands are sent in one round-trip
        const pipeline = redisClient.multi();

        // 1. Remove entries older than the sliding window
        pipeline.zRemRangeByScore(key, "-inf", windowStart);

        // 2. Add the current request (score = now, member = unique stamp)
        pipeline.zAdd(key, { score: now, value: `${now}-${Math.random()}` });

        // 3. Count entries in the window
        pipeline.zCard(key);

        // 4. Refresh TTL so the key does not live forever
        pipeline.expire(key, KEY_TTL_SEC);

        const results = await pipeline.exec();

        // zCard result is at index 2
        const count = results[2];

        if (count > MAX_PER_WINDOW) {
            throw ApiError.tooManyRequests(
                `Message rate limit exceeded. Max ${MAX_PER_WINDOW} messages per ${WINDOW_MS / 1000}s.`
            );
        }
    } catch (err) {
        // Re-throw rate-limit errors as-is
        if (err.statusCode === 429) throw err;

        // Redis failure — log warning and allow the request through.
        // Never let infrastructure issues block legitimate messages.
        logger.warn("Rate limiter Redis error — allowing request through", {
            userId,
            error: err.message
        });
    }
};

module.exports = { checkRateLimit };
