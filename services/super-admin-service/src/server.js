/* eslint-disable no-console */
import dotenv from "dotenv";
import app from "./app.js";

dotenv.config();

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || "localhost";

const server = app.listen(PORT, () => {
  console.log("=================================");
  console.log("🚀 Super Admin Service Running");
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📡 URL: http://${HOST}:${PORT}`);
  console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
  console.log("=================================");
});

/**
 * Graceful Shutdown
 */
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Closing server...");
  server.close(() => {
    console.log("Server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Closing server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

/**
 * Handle unhandled promise rejection
 */
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
  server.close(() => process.exit(1));
});

export default server;