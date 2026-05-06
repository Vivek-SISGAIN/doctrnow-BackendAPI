// /**
//  * Patient Support Chat API Client
//  * ────────────────────────────────
//  * Connects to /api/v1/admin-chat on the API Gateway.
//  * The gateway reads the JWT and injects x-user-id + x-user-role: PATIENT
//  * headers to the backend — the patient does NOT need to pass their role manually.
//  *
//  * Usage:
//  *   import { SupportChatApi } from "@/api/supportChat.api";
//  *
//  *   // Create a support request
//  *   const session = await SupportChatApi.createRequest({ requesterName: "Jane Doe", subject: "Payment issue" });
//  *
//  *   // Get current open session
//  *   const session = await SupportChatApi.getMySession();
//  *
//  * Socket:
//  *   Use supportChatSocket.ts (copied from hospital-admin portal pattern) —
//  *   it authenticates via JWT and uses the same event names.
//  *   The backend sets senderRole from socket.user.role automatically.
//  */

// // NOTE: Replace `apiRequest` with whatever HTTP client wrapper your Patient app uses.
// // The pattern is identical to DoctrNow-Hospitaladmin-Frontend/src/api/api.ts.
// import { apiRequest } from "./api";

// // ─── Types ───────────────────────────────────────────────────────────────────

// export interface ChatAttachment {
//   url: string;
//   key: string;
//   originalName: string;
//   mimeType: string;
//   size: number;
// }

// export interface SupportChatMessage {
//   _id: string;
//   sessionId: string;
//   senderId: string;
//   senderRole: string;
//   text: string;
//   clientMsgId: string | null;
//   readBy: Array<{ userId: string; readAt: string }>;
//   attachments: ChatAttachment[];
//   createdAt: string;
// }

// export interface SupportChatSession {
//   _id: string;
//   /** The patient's user ID — populated when session is created by a PATIENT. */
//   patientId: string | null;
//   /** The requester's display name (patient's full name). */
//   requesterName: string | null;
//   /** Always "PATIENT" for sessions created by a patient. */
//   requesterRole: "PATIENT" | null;
//   superAdminId: string | null;
//   superAdminName: string | null;
//   subject: string | null;
//   status: "REQUESTED" | "ACTIVE" | "ENDED";
//   startedAt: string | null;
//   endedAt: string | null;
//   createdAt: string;
//   updatedAt: string;
// }

// // ─── API ─────────────────────────────────────────────────────────────────────

// const BASE = "/api/v1/admin-chat";

// export const SupportChatApi = {
//   /**
//    * Patient creates a support request.
//    * The gateway injects x-user-role: PATIENT automatically from the JWT.
//    * requesterName is the patient's full name shown to the super admin.
//    */
//   createRequest: (payload: {
//     subject?: string;
//     requesterName: string; // patient's full name
//   }) =>
//     apiRequest<{ success: boolean; data: SupportChatSession }>({
//       url: `${BASE}/request`,
//       method: "POST",
//       data: payload,
//     }),

//   /** Patient fetches their own active/pending session (returns null if none). */
//   getMySession: () =>
//     apiRequest<{ success: boolean; data: SupportChatSession | null }>({
//       url: `${BASE}/my-session`,
//     }),

//   /** Either party — end the session. */
//   endSession: (sessionId: string) =>
//     apiRequest<{ success: boolean; data: SupportChatSession }>({
//       url: `${BASE}/requests/${sessionId}/end`,
//       method: "POST",
//     }),

//   /** Fetch a single session by ID. */
//   getSession: (sessionId: string) =>
//     apiRequest<{ success: boolean; data: SupportChatSession }>({
//       url: `${BASE}/session/${sessionId}`,
//     }),

//   /**
//    * Fetch persisted messages for a session.
//    * Use on mount/page refresh to restore history.
//    */
//   getSessionMessages: (sessionId: string, params?: { limit?: number; before?: string }) =>
//     apiRequest<{ success: boolean; data: SupportChatMessage[] }>({
//       url: `${BASE}/session/${sessionId}/messages`,
//       params,
//     }),

//   /**
//    * Upload a file attachment.
//    * Returns the attachment metadata (including a pre-signed URL) to include
//    * in the socket message via sendAdminChatMessage(sessionId, text, [attachment]).
//    */
//   uploadAttachment: (sessionId: string, file: File): Promise<ChatAttachment> => {
//     const formData = new FormData();
//     formData.append("file", file);
//     return apiRequest<{ success: boolean; data: ChatAttachment }>({
//       url: `${BASE}/session/${sessionId}/upload`,
//       method: "POST",
//       data: formData,
//     }).then((res) => res.data.data);
//   },
// };
