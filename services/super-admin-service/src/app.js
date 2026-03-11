const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");

const app = express();

/**
 * Security Middlewares
 */
app.use(helmet());
app.use(hpp());

/**
 * Rate Limiting
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});

app.use("/api", limiter);

/**
 * CORS
 */
app.use(
  cors({
    origin: "http://localhost:8080",
    credentials: true,
  })
);

/**
 * Body Parsing
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/**
 * Cookies
 */
app.use(cookieParser());

/**
 * Compression
 */
app.use(compression());

/**
 * Logging
 */
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

/**
 * Health Check
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "super-admin-service",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Root Endpoint
 */
app.get("/", (req, res) => {
  res.json({
    message: "DoctorNow Super Admin Service",
    version: "1.0.0",
    status: "active",
    endpoints: {
      superAdmins: "/api/super-admins",
      documentation: "/api-docs",
      health: "/health",
    },
  });
});


/**
 * Routes
 */
const superAdminRoutes = require("./routes/user.routes");

app.use("/api/super-admins", superAdminRoutes);

/**
 * Error Handler
 */
app.use((err, req, res, next) => {
  console.error(err);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message || "Something went wrong",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

/**
 * 404 Handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

module.exports = app;