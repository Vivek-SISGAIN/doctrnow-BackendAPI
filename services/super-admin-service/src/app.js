import express, { json, urlencoded } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import hpp from "hpp";

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
  windowMs: 60 * 100,
  max: 100000,
  message: "Too many requests from this IP, please try again later.",
});

app.use("/api", limiter);


const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : null;

// NOTE: When `credentials: true`, CORS cannot use `Access-Control-Allow-Origin: *`.
// If no allowlist is provided, reflect the request origin (permissive, but works).
const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header)
    if (!origin) return callback(null, true);

    if (!allowedOrigins || allowedOrigins.length === 0) {
      return callback(null, true); // reflect origin
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }

    return callback(new Error(`CORS: Origin '${origin}' is not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Correlation-ID",
    "X-User-ID",
    "X-User-Role",
    "X-Tenant-ID",
    "X-Request-ID",
    "x-client",
  ],
};

app.use(cors(corsOptions));

// Respond to pre-flight requests immediately so they never reach
// Multer or other middleware that could throw before CORS headers are set.
app.options("/{*path}", cors(corsOptions));

/**
 * Body Parsing
 */
app.use(json({ limit: "10mb" }));
app.use(urlencoded({ extended: true, limit: "10mb" }));

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
import superAdminRoutes from "./routes/hospital.routes.js";
import internalSearchRoutes from "./routes/internalSearch.route.js";
import internalStripeStatusRoutes from "./routes/internalStripeStatus.route.js";
import ticketRoutes from "./routes/ticket.routes.js";

app.use("/internal/search", internalSearchRoutes);
app.use("/internal", internalStripeStatusRoutes);

app.use("/api/super-admins", superAdminRoutes);
app.use("/api/super-admins/tickets", ticketRoutes);



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

export default app;
