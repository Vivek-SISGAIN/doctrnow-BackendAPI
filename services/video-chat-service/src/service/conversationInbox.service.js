"use strict";

const mongoose = require("mongoose");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const logger = require("../utils/logger");

// ─── Errors ───────────────────────────────────────────────────────────────────

class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "NotFoundError";
        this.statusCode = 404;
    }
}

class ForbiddenError extends Error {
    constructor(message) {
        super(message);
        this.name = "ForbiddenError";
        this.statusCode = 403;
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_INBOX_LIMIT = 20;
const MAX_INBOX_LIMIT = 100;

// ─── markConversationRead ─────────────────────────────────────────────────────

/**
 * Atomically sets lastReadMessageAt = now for the calling participant.
 *
 * Design decisions:
 *   - Uses arrayFilters positional update so only the matching participant
 *     subdoc is touched — O(1) write, no full-document rewrite.
 *   - Idempotent: calling twice in the same millisecond is safe.
 *   - Returns the updated conversation for immediate client feedback.
 *
 * @param {object} params
 * @param {string} params.conversationId
 * @param {string} params.userId
 * @returns {Promise<object>} Updated conversation document
 */
const markConversationRead = async ({ conversationId, userId }) => {
    if (!conversationId || !userId) {
        const err = new Error("conversationId and userId are required");
        err.statusCode = 400;
        throw err;
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        const err = new Error("Invalid conversationId");
        err.statusCode = 400;
        throw err;
    }

    const now = new Date();

    const updated = await Conversation.findOneAndUpdate(
        {
            _id: conversationId,
            "participants.userId": userId   // ensures user is actually a participant
        },
        {
            $set: {
                "participants.$[p].lastReadMessageAt": now
            }
        },
        {
            arrayFilters: [{ "p.userId": userId }],
            new: true,
            runValidators: false            // no need to rerun full schema validation
        }
    );

    if (!updated) {
        // Either conversation doesn't exist or user is not a participant
        throw new ForbiddenError(
            "Conversation not found or you are not a participant"
        );
    }

    logger.info("markConversationRead", { conversationId, userId, readAt: now });

    return { conversationId, readAt: now };
};

// ─── getConversationInbox ─────────────────────────────────────────────────────

/**
 * Returns a paginated inbox for the calling user.
 *
 * Part 2 enhancements:
 *   - Excludes archived conversations by default (includeArchived flag overrides)
 *   - Sort priority: pinnedAt DESC (nulls last), then lastMessageAt DESC
 *   - Uses denormalised preview fields when available; falls back to $lookup
 *   - Returns { conversations, nextCursor, hasMore }
 *
 * UnreadCount sub-pipeline already excludes:
 *   - own messages (senderId !== userId)
 *   - SYSTEM divider messages (senderRole !== 'SYSTEM')
 *   - soft-deleted messages (deleted !== true)   ← Part 6 guard
 *
 * Pagination cursor is based on lastMessageAt (ISO string).
 *
 * @param {object} params
 * @param {string}        params.userId
 * @param {string|null}   [params.role]
 * @param {number}        [params.limit]
 * @param {string|null}   [params.cursor]          - ISO-8601 date string
 * @param {boolean}       [params.includeArchived]  - default false
 * @returns {Promise<{ conversations: object[], nextCursor: string|null, hasMore: boolean }>}
 */
const getConversationInbox = async ({
    userId,
    role,
    limit = DEFAULT_INBOX_LIMIT,
    cursor = null,
    includeArchived = false
}) => {
    if (!userId) {
        const err = new Error("userId is required");
        err.statusCode = 400;
        throw err;
    }

    // Clamp limit
    const safeLimit = Math.min(
        Math.max(1, parseInt(limit, 10) || DEFAULT_INBOX_LIMIT),
        MAX_INBOX_LIMIT
    );

    // ── 1. Build base match ──────────────────────────────────────────────────

    // Filter by participant membership (+ optional role filter)
    const participantFilter = role
        ? { $elemMatch: { userId, role } }
        : { $elemMatch: { userId } };

    const baseMatch = {
        participants: participantFilter
    };

    // Cursor pagination: only conversations whose last message is older than cursor
    if (cursor) {
        const cursorDate = new Date(cursor);
        if (isNaN(cursorDate.getTime())) {
            const err = new Error("Invalid cursor — must be an ISO-8601 date string");
            err.statusCode = 400;
            throw err;
        }
        baseMatch.lastMessageAt = { $lt: cursorDate };
    }

    const pipeline = [
        // ── Step 1: Match conversations this user participates in ─────────────
        { $match: baseMatch },

        // ── Step 2: Extract THIS user's participant subdoc ────────────────────
        //    We need lastReadMessageAt (unread) + archivedAt/pinnedAt (state).
        {
            $addFields: {
                _thisParticipant: {
                    $arrayElemAt: [
                        {
                            $filter: {
                                input: "$$ROOT.participants",
                                as: "p",
                                cond: { $eq: ["$$p.userId", userId] }
                            }
                        },
                        0
                    ]
                }
            }
        },

        // ── Step 3: Exclude archived conversations (unless includeArchived=true) ─
        ...(!includeArchived
            ? [{
                $match: {
                    $or: [
                        { "_thisParticipant.archivedAt": null },
                        { "_thisParticipant.archivedAt": { $exists: false } }
                    ]
                }
            }]
            : []),

        // ── Step 4: Sort — pinned first (pinnedAt DESC nulls-last), then recency ─
        //    MongoDB sorts null/missing values to the front in DESC order.
        //    We coerce null pinnedAt to epoch-0 so pinned items float to the top.
        {
            $addFields: {
                _pinnedSort: {
                    $ifNull: ["$_thisParticipant.pinnedAt", new Date(0)]
                }
            }
        },
        {
            $sort: {
                _pinnedSort:   -1,
                lastMessageAt: -1
            }
        },

        // ── Step 5: Fetch one extra doc to detect next page ───────────────────
        { $limit: safeLimit + 1 },

        // ── Step 6: Unread count sub-pipeline ─────────────────────────────────
        //    Excludes: own messages, SYSTEM messages, soft-deleted messages (Part 6)
        {
            $lookup: {
                from: "messages",
                let: {
                    convId:   "$_id",
                    lastRead: "$_thisParticipant.lastReadMessageAt"
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$conversationId", "$$convId"] },

                                    // Only count messages NEWER than lastRead.
                                    // If lastRead is null the user has never read,
                                    // so all messages count.
                                    {
                                        $cond: {
                                            if:   { $gt: ["$$lastRead", null] },
                                            then: { $gt: ["$createdAt", "$$lastRead"] },
                                            else: true
                                        }
                                    },

                                    // Exclude own messages
                                    { $ne: ["$senderId", userId] },

                                    // Exclude SYSTEM divider messages
                                    { $ne: ["$senderRole", "SYSTEM"] },

                                    // Part 6: Exclude soft-deleted messages
                                    { $ne: ["$deleted", true] }
                                ]
                            }
                        }
                    },
                    { $count: "count" }
                ],
                as: "_unreadResult"
            }
        },

        // ── Step 7: Conditionally $lookup lastMessage (fallback only) ─────────
        //    Only needed when denormalised preview fields are absent.
        //    We always run the lookup but only use it in the projection below
        //    when lastMessagePreview is null.
        {
            $lookup: {
                from: "messages",
                localField: "lastMessage",
                foreignField: "_id",
                as: "_lastMessageDoc"
            }
        },

        // ── Step 8: Project final response shape ──────────────────────────────
        {
            $project: {
                _id: 0,
                conversationId:  "$_id",
                consultationId:  1,
                sessionStatus:   "$chatState",
                lastMessageAt:   1,
                participants:    1,
                patientName:     1,
                patientAvatar:   1,

                unreadCount: {
                    $ifNull: [
                        { $arrayElemAt: ["$_unreadResult.count", 0] },
                        0
                    ]
                },

                // Muted/pinned/archived state for this participant
                muted:      "$_thisParticipant.muted",
                pinnedAt:   "$_thisParticipant.pinnedAt",
                archivedAt: "$_thisParticipant.archivedAt",

                // ── Part 2: Prefer denormalised preview; fallback to $lookup ──
                //    lastMessagePreview is truthy  → use denormalised fields
                //    lastMessagePreview is null/""  → reconstruct from last msg doc
                lastMessagePreview: {
                    $cond: {
                        if: { $ifNull: ["$lastMessagePreview", false] },
                        then: "$lastMessagePreview",
                        else: {
                            $let: {
                                vars: { msg: { $arrayElemAt: ["$_lastMessageDoc", 0] } },
                                in: {
                                    $switch: {
                                        branches: [
                                            {
                                                case: { $eq: ["$$msg.type", "IMAGE"] },
                                                then: "🖼 Image"
                                            },
                                            {
                                                case: { $eq: ["$$msg.type", "FILE"] },
                                                then: "📎 Attachment"
                                            },
                                            {
                                                case: { $eq: ["$$msg.type", "TEXT"] },
                                                then: { $substr: [{ $ifNull: ["$$msg.content", ""] }, 0, 60] }
                                            }
                                        ],
                                        default: null
                                    }
                                }
                            }
                        }
                    }
                },

                lastMessageType: {
                    $ifNull: [
                        "$lastMessageType",
                        { $arrayElemAt: ["$_lastMessageDoc.type", 0] }
                    ]
                },

                lastSenderRole: {
                    $ifNull: [
                        "$lastSenderRole",
                        { $arrayElemAt: ["$_lastMessageDoc.senderRole", 0] }
                    ]
                },

                lastSystemEvent: 1
            }
        }
    ];

    const results = await Conversation.aggregate(pipeline);

    // Determine if there is a next page
    const hasMore = results.length > safeLimit;
    if (hasMore) results.pop(); // remove the extra sentinel doc

    const nextCursor =
        hasMore && results.length > 0
            ? results[results.length - 1].lastMessageAt?.toISOString() ?? null
            : null;

    logger.info("getConversationInbox", {
        userId,
        role,
        includeArchived,
        returned: results.length,
        hasMore
    });

    // Part 2: renamed shape — items → conversations
    return { conversations: results, nextCursor, hasMore };
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    markConversationRead,
    getConversationInbox
};
