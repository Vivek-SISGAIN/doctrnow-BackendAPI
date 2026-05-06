// /**
//  * Support Chat Socket — Doctor / Patient App
//  * ────────────────────────────────────────────
//  * This file is identical in function to DoctrNow-Hospitaladmin-Frontend/src/socket/adminChatSocket.ts.
//  * Copy this file into your Doctor or Patient app's src/socket/ directory.
//  *
//  * It is completely role-agnostic:
//  *   - Authentication: via the JWT token (which carries the correct DOCTOR or PATIENT role).
//  *   - The backend sets senderRole in messages from socket.user.role — NOT from the client.
//  *   - Event names are identical for all roles.
//  *
//  * To use in a Doctor or Patient app:
//  *   1. Copy this file into src/socket/supportChatSocket.ts
//  *   2. Replace tokenService.getAccessToken() with however your app stores the JWT.
//  *   3. Ensure VITE_API_BASE_URL (or equivalent) points to your API Gateway.
//  *   4. Use SupportChatApi from doctorSupportChat.api.ts or patientSupportChat.api.ts
//  *      to create/end sessions via REST, and this file for real-time events.
//  */

// import { io, Socket } from "socket.io-client";

// export interface SupportChatMessage {
//   sessionId: string;
//   senderId: string;
//   senderRole: string;   // populated by backend from JWT — "DOCTOR" | "PATIENT" | "SUPER_ADMIN"
//   text: string;
//   clientMsgId: string | null;
//   timestamp: string;
//   attachments: Array<{
//     url: string;
//     key: string;
//     originalName: string;
//     mimeType: string;
//     size: number;
//   }>;
// }

// type EventHandler<T = unknown> = (payload: T) => void;

// let supportChatSocket: Socket | null = null;

// const getChatSocketUrl = (): string => {
//   // Replace with your app's env variable for the API Gateway base URL
//   const raw =
//     (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) ||
//     (typeof window !== "undefined" ? window.location.origin : "");
//   try {
//     return new URL(raw).origin;
//   } catch {
//     return raw;
//   }
// };

// /**
//  * Replace this with however your Doctor/Patient app retrieves the JWT access token.
//  * e.g. AsyncStorage.getItem("accessToken") for React Native.
//  */
// const getToken = (): string | null =>
//   (typeof sessionStorage !== "undefined" && sessionStorage.getItem("accessToken")) ||
//   (typeof localStorage !== "undefined" && localStorage.getItem("accessToken")) ||
//   null;

// // ─── Connection ───────────────────────────────────────────────────────────────

// export const connectSupportChatSocket = (): Socket => {
//   if (supportChatSocket?.connected) return supportChatSocket;
//   if (supportChatSocket) return supportChatSocket; // mid-handshake

//   const token = getToken();

//   supportChatSocket = io(getChatSocketUrl(), {
//     path: "/chat-events",        // proxied by API Gateway to video-chat-service
//     transports: ["websocket", "polling"],
//     auth: token ? { token } : undefined,
//     reconnection: true,
//     reconnectionAttempts: 10,
//     reconnectionDelay: 1500,
//   });

//   supportChatSocket.on("connect_error", (err) => {
//     console.error("[support-chat-socket] connect_error", err.message);
//   });

//   return supportChatSocket;
// };

// export const disconnectSupportChatSocket = (): void => {
//   supportChatSocket?.disconnect();
//   supportChatSocket = null;
// };

// // ─── Room management ─────────────────────────────────────────────────────────

// export const joinSessionRoom = (sessionId: string): void => {
//   supportChatSocket?.emit("admin_chat:join_session", { sessionId });
// };

// export const leaveSessionRoom = (sessionId: string): void => {
//   supportChatSocket?.emit("admin_chat:leave_session", { sessionId });
// };

// // ─── Send ─────────────────────────────────────────────────────────────────────

// export const sendSupportChatMessage = (
//   sessionId: string,
//   text: string,
//   attachments?: Array<{ url: string; key: string; originalName: string; mimeType: string; size: number }>
// ): void => {
//   supportChatSocket?.emit("admin_chat:message", {
//     sessionId,
//     text,
//     clientMsgId: typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}`,
//     attachments: attachments ?? [],
//   });
// };

// export const sendTypingIndicator = (sessionId: string, isTyping: boolean): void => {
//   supportChatSocket?.emit("admin_chat:typing", { sessionId, isTyping });
// };

// // ─── Subscriptions ────────────────────────────────────────────────────────────

// /** Fired when a super admin accepts the request */
// export const onSessionAccepted = (
//   handler: EventHandler<{ sessionId: string; superAdminId: string; superAdminName: string | null; startedAt: string }>
// ): (() => void) => {
//   if (!supportChatSocket) return () => undefined;
//   supportChatSocket.on("admin_chat:accepted", handler as EventHandler);
//   return () => supportChatSocket?.off("admin_chat:accepted", handler as EventHandler);
// };

// /** Real-time message in the active session */
// export const onSupportChatMessage = (handler: EventHandler<SupportChatMessage>): (() => void) => {
//   if (!supportChatSocket) return () => undefined;
//   supportChatSocket.on("admin_chat:message", handler as EventHandler);
//   return () => supportChatSocket?.off("admin_chat:message", handler as EventHandler);
// };

// /** Session was ended (by either party) */
// export const onSessionEnded = (handler: EventHandler<{ sessionId: string; endedAt: string }>): (() => void) => {
//   if (!supportChatSocket) return () => undefined;
//   supportChatSocket.on("admin_chat:ended", handler as EventHandler);
//   return () => supportChatSocket?.off("admin_chat:ended", handler as EventHandler);
// };

// /** Typing indicator from the super admin */
// export const onTyping = (
//   handler: EventHandler<{ sessionId: string; senderId: string; isTyping: boolean }>
// ): (() => void) => {
//   if (!supportChatSocket) return () => undefined;
//   supportChatSocket.on("admin_chat:typing", handler as EventHandler);
//   return () => supportChatSocket?.off("admin_chat:typing", handler as EventHandler);
// };

// /** Send read receipts for a list of message IDs */
// export const sendReadReceipt = (sessionId: string, messageIds: string[]): void => {
//   if (!messageIds.length) return;
//   supportChatSocket?.emit("admin_chat:read_receipt", { sessionId, messageIds });
// };

// /** Listen for read receipt events from the other party */
// export const onMessagesRead = (
//   handler: (payload: { sessionId: string; readBy: string; messageIds: string[]; readAt: string }) => void
// ): (() => void) => {
//   if (!supportChatSocket) return () => undefined;
//   supportChatSocket.on("admin_chat:messages_read", handler as EventHandler);
//   return () => supportChatSocket?.off("admin_chat:messages_read", handler as EventHandler);
// };
