const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const chatRoutes = require("./routes/chat.routes");
const adminChatRoutes = require("./routes/adminChat.routes");

const app = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "video-chat-service" });
});

// ─── Gateway identity middleware ────────────────────────────────────────────
// The API Gateway validates the JWT and forwards user identity as headers.
// This middleware reconstructs req.user so controllers can access it.
app.use((req, res, next) => {
    const userId = req.headers['x-user-id'];
    const role   = req.headers['x-user-role'];
    if (userId && role) {
        req.user = {
            userId,
            role,
            tenantId: req.headers['x-tenant-id'] || null
        };
        console.log(`[VideoChatService] Incoming request: ${req.method} ${req.url} | User: ${JSON.stringify(req.user)}`);
    } else {
        console.warn(`[VideoChatService] Request without valid user headers: ${req.method} ${req.url}`, req.headers);
    }
    next();
});

// ─── Routes ──────────────────────────────────────────────────────────────────
// Existing patient-doctor chat — unchanged
app.use("/api/chat", chatRoutes);

// New admin support chat (Hospital Admin ↔ Super Admin)
app.use("/api/admin-chat", adminChatRoutes);

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[VideoChatService] Global Error on ${req.url}:`, err);
    res.status(statusCode).json({ success: false, error: message });
});

module.exports = app;