# Video & Chat Service

Handles WebRTC video calls and real-time chat messaging.

## Responsibilities

- WebRTC signaling
- Video call management
- Real-time chat messaging
- Screen sharing
- Call recording (with consent)
- Chat history

## Storage

- Chat messages: MongoDB
- Call recordings: S3-compatible storage
- Signaling data: Redis (temporary)

## API Endpoints

- `POST /video/call/initiate` - Initiate video call
- `POST /video/call/:callId/end` - End video call
- `GET /video/call/:callId/token` - Get WebRTC token
- `POST /chat/messages` - Send message
- `GET /chat/messages/:consultationId` - Get chat history

## Events Published

- `VideoCallInitiated`
- `VideoCallEnded`
- `ChatMessageSent`

## Events Consumed

- `ConsultationStarted` (from Consultation Service)
- `ConsultationCompleted` (from Consultation Service)

