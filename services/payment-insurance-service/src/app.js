const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const swaggerUi = require('swagger-ui-express');

const config = require('./config');
const swaggerSpec = require('./config/swagger');
const fhirRoutes = require('./routes/fhir.routes');
const paymentRoutes = require('./routes/payment.routes');
const insuranceRoutes = require('./routes/insurance.routes');
const stripeRoutes = require('./routes/stripe.routes');
const internalRoutes = require('./routes/internal.routes');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI to load resources
  })
);
app.use(hpp());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100000,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

const corsOptions = {
  origin: config.cors.origin,
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'X-Client',
    'Accept',
    'x-user-id',
    'x-user-role',
    'x-tenant-id',
    'x-correlation-id',
  ],
};
app.use(cors(corsOptions));

/**
 * CRITICAL: Mount the Stripe webhook route BEFORE global express.json().
 *
 * The webhook handler uses express.raw({type:'application/json'}) inline on
 * POST /api/payments/stripe/webhook. If global express.json() runs first, it
 * consumes the request body stream and req.body becomes a parsed object —
 * Stripe's constructEvent() then receives stringified JSON instead of the
 * original byte sequence, which breaks HMAC signature verification.
 *
 * By mounting this router here (before express.json()), Express applies the
 * inline express.raw() middleware first for the webhook path, keeping req.body
 * as a raw Buffer for signature verification.
 *
 * POST /accounts reads req.body, so it carries its own inline express.json()
 * in stripe.routes.js. POST /accounts/:hospitalId/onboarding-link only reads
 * req.params and needs no body parser.
 */
app.use('/api/payments/stripe', stripeRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'payment-insurance-service',
    cernerSandbox: {
      url: config.cerner.baseUrl,
      status: 'connected',
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * API Root Welcome endpoint
 */
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to DoctorNow Payment, Insurance & Cerner FHIR Service API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      health: '/health',
      documentation: '/api-docs',
      cernerFhir: {
        patients: '/api/fhir/Patient',
        patientById: '/api/fhir/Patient/12742400',
        patientSummary: '/api/fhir/patient-summary/12742400',
        observations: '/api/fhir/Observation?patient=12742400',
        conditions: '/api/fhir/Condition?patient=12742400',
        encounters: '/api/fhir/Encounter?patient=12742400',
        medicationRequests: '/api/fhir/MedicationRequest?patient=12742400',
        practitioners: '/api/fhir/Practitioner?name=Smith',
        sandboxPatients: '/api/fhir/sandbox-patients',
      },
      payments: '/api/payments',
      insurance: '/api/insurance',
    },
  });
});

// Swagger documentation
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'DoctorNow Payment, Insurance & Cerner FHIR API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
    },
  })
);

// Mount main service routes
app.use('/api/fhir', fhirRoutes);
app.use('/api/payments', paymentRoutes);        // Legacy mock routes (Phase-0)
// Note: /api/payments/stripe/* is already mounted early (before express.json)
// for correct raw-body handling on the webhook endpoint.
app.use('/api/insurance', insuranceRoutes);
app.use('/internal', internalRoutes);

// Direct top-level FHIR routes (matches user requested aliases like /Patient, /Observation, etc.)
app.use('/', fhirRoutes);

if (process.env.NODE_ENV !== 'test') {
  require('./cron/commissionInvoice.cron');
}

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  const response = {
    success: false,
    status,
    message: err.message || 'Something went wrong!',
  };

  if (err.details) {
    response.details = err.details;
  }

  if (config.env === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found on payment-insurance-service`,
  });
});

module.exports = app;
