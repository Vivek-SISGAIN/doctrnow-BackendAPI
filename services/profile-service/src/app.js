const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();

app.use(helmet());
app.use(hpp());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

const corsOptions = {
  origin: 'http://localhost:8080',
  credentials: true,
  allowedHeaders: '*'
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cookieParser());

app.use(compression());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 message:
 *                   type: string
 *                   example: Server is running
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /:
 *   get:
 *     summary: API welcome message
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Welcome message with available endpoints
 */
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to DoctorNow Profile Service API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      patients: '/api/patients',
      familyMembers: '/api/family-members',
      doctors: '/api/doctors',
      hospitalAdmins: '/api/hospital-admins',
      superAdmins: '/api/super-admins',
      documentation: '/api-docs'
    }
  });
});

// Swagger documentation
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'DoctorNow API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true
    }
  })
);

// Import routes
const patientRoutes = require('./routes/patient.routes');
const familyMemberRoutes = require('./routes/familyMember.routes');
const doctorRoutes = require('./routes/doctor.routes');
const specialtyRoutes = require('./routes/specialty.routes');
const hospitalAdminRoutes = require('./routes/hospitalAdmin.routes');
const superAdminRoutes = require('./routes/superAdmin.routes');
const insuranceProviderRoutes = require('./routes/insuranceProvider.routes');

// Register routes
app.use('/api/patients', patientRoutes);
app.use('/api/family-members', familyMemberRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/specialties', specialtyRoutes);
app.use('/api/hospital-admins', hospitalAdminRoutes);
app.use('/api/super-admins', superAdminRoutes);
app.use('/api/insurance-providers', insuranceProviderRoutes);

// Error handling middleware
app.use((err, req, res) => {
  // eslint-disable-next-line no-console
  console.error(err);

  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  const response = {
    success: false,
    status,
    message: err.message || 'Something went wrong!'
  };

  if (err.errors) {
    response.errors = err.errors;
  }

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

module.exports = app;
