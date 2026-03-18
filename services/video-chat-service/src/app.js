const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const chatRoutes = require("./routes/chat.routes");

const app = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "video-chat-service" });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/chat", chatRoutes);

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({ success: false, error: message });
});

module.exports = app;