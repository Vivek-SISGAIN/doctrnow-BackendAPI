# FINAL Detailed Chat Implementation Plan
Video & Chat Service

This document defines the FINAL implementation plan for consultation-bound
real-time chat messaging.

The design follows a session-centric communication model where chat is enabled
only around the consultation time window.

NOTE:
Whenever new APIs are created or existing APIs are modified,
they must be immediately documented in the main service README
under the API Endpoints section.

-------------------------------------------------------
CORE CHAT POLICY
-------------------------------------------------------

1. No pre-consultation messaging allowed.
2. Chat session opens 5 minutes before consultation start.
3. Unlimited messaging during active consultation.
4. After consultation completion:
   - Patient can send limited messages (config driven).
   - Doctor messaging unrestricted.
5. After patient limit exhausted → chat becomes read-only.
6. If consultation cancelled → chat never enabled.
7. If patient no-show → post chat limit = 0.
8. If doctor no-show → chat may remain open for support/admin handling.

-------------------------------------------------------
PHASE 1 — SERVICE SETUP
-------------------------------------------------------

1. Implement Chat module inside Video & Chat Service.
2. Configure MongoDB connection.
3. Configure Redis connection for:
   - Socket scaling
   - Presence tracking
   - Pub/Sub messaging
   - Temporary typing indicators
4. Configure Socket.IO server instance.
5. Implement socket authentication middleware (JWT).
6. Configure environment variables:
   - Mongo URL
   - Redis URL
   - S3 config
   - JWT config
   - Message size limits
   - Allowed attachment types

-------------------------------------------------------
PHASE 2 — DATABASE COLLECTIONS
-------------------------------------------------------

Collections:

- conversations
- consultation_chat_sessions
- messages
- message_receipts (future group support)

Indexes:

messages:
- (conversationId, createdAt desc)
- clientMessageId unique
- consultationSessionId

consultation_chat_sessions:
- consultationId unique

conversations:
- consultationId
- participants

-------------------------------------------------------
PHASE 3 — CHAT SESSION LIFECYCLE
-------------------------------------------------------

Conversation creation:
- Conversation created when consultation is CONFIRMED.

Chat session creation:
- At (consultationStartTime - 5 minutes)
- Triggered via scheduler or consultation event.

Session document fields:

consultationId
conversationId
startedAt
endedAt
status: ACTIVE | ENDED | CANCELLED
postMessageLimit
patientPostMessageCount

-------------------------------------------------------
PHASE 4 — CONSULTATION STATE HANDLING
-------------------------------------------------------

ConsultationCompleted:
- update session endedAt
- fetch post chat limit from config service
- store limit

PatientNoShow:
- update session endedAt
- set postMessageLimit = 0

DoctorNoShow:
- update session endedAt
- optionally allow patient limited chat

ConsultationCancelled:
- do not create chat session
- mark conversation chatState = CLOSED

-------------------------------------------------------
PHASE 5 — MESSAGE SEND FLOW
-------------------------------------------------------

API:
POST /chat/messages

Steps:

1. Authenticate user.
2. Validate conversation membership.
3. Fetch active consultation session.

4. If session not started:
   → reject message.

5. If session active:
   → allow unlimited messaging.

6. If session ended AND senderRole = patient:

   Atomic validation required:

   findOneAndUpdate(
      { consultationId, patientPostMessageCount < postMessageLimit },
      { $inc: { patientPostMessageCount: 1 } }
   )

   If update fails → reject.

7. Save message in MongoDB.

8. Publish Redis event:
   ChatMessageSent

9. Emit socket event:
   message:new

-------------------------------------------------------
PHASE 6 — SYSTEM DIVIDER MESSAGES
-------------------------------------------------------

System must auto insert marker messages:

- CHAT_SESSION_STARTED
- CONSULTATION_COMPLETED
- PATIENT_NO_SHOW
- DOCTOR_NO_SHOW
- CHAT_CLOSED

These are stored as message type = SYSTEM.

Frontend renders visual divider.

-------------------------------------------------------
PHASE 7 — MESSAGE STRUCTURE
-------------------------------------------------------

Message document:

_id
conversationId
consultationId
consultationSessionId
senderId
senderRole
type: TEXT | FILE | IMAGE | SYSTEM
content
fileUrl
fileMeta
status
deliveredTo[]
readBy[]
edited
deleted
clientMessageId
createdAt
updatedAt

-------------------------------------------------------
PHASE 8 — MESSAGE HISTORY
-------------------------------------------------------

API:
GET /chat/messages/:consultationId?cursor

Rules:

- cursor based pagination
- sort by createdAt desc + _id desc
- return session metadata

-------------------------------------------------------
PHASE 9 — SESSION INFO API
-------------------------------------------------------

API:
GET /chat/session-info/:consultationId

Returns:

conversationId
chatEnabled
consultationEnded
remainingPatientMessages
sessionStartTime
sessionEndTime

-------------------------------------------------------
PHASE 10 — REALTIME SOCKET EVENTS
-------------------------------------------------------

Client → Server:

- conversation:join
- typing:start
- typing:stop
- message:delivered
- message:read

Server → Client:

- message:new
- message:edited
- message:deleted
- message:delivered
- message:read
- user:typing
- chat:session-started
- chat:session-ended

Message sending must happen via REST only.

-------------------------------------------------------
PHASE 11 — RECONNECT & SYNC
-------------------------------------------------------

On reconnect:

Client calls:

GET /chat/sync?conversationId&afterTimestamp

Server returns:

- missed messages
- updated delivery statuses
- session updates

-------------------------------------------------------
PHASE 12 — ATTACHMENT FLOW
-------------------------------------------------------

1. Upload via:
   POST /chat/upload

2. Store in S3.
3. Save metadata in message.

-------------------------------------------------------
PHASE 13 — PRESENCE TRACKING
-------------------------------------------------------

- socket connect → mark user online in Redis
- socket disconnect → mark offline + store lastSeen
- presence used for delivery optimisation

-------------------------------------------------------
PHASE 14 — SECURITY
-------------------------------------------------------

- backend enforced chat limits
- JWT authentication
- role validation
- signed file URLs
- rate limiting
- audit logging

-------------------------------------------------------
PHASE 15 — SCALABILITY
-------------------------------------------------------

- Redis adapter for socket horizontal scaling
- stateless API servers
- Mongo sharding by conversationId (future)
- archival strategy for old chats

-------------------------------------------------------
PHASE 16 — TESTING SCENARIOS
-------------------------------------------------------

Must validate:

- chat opens only at T-5 minutes
- unlimited messaging during consultation
- post consultation patient limit
- patient no-show restriction
- cancellation chat disabled
- duplicate message protection
- reconnect sync
- pagination correctness
- delivery/read receipt behaviour
- system divider rendering