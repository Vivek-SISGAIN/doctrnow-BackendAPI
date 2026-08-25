const swaggerJSDoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'DoctorNow Payment, Insurance & Cerner FHIR API',
    version: '1.0.0',
    description:
      'Payment processing, Insurance claims, and Cerner FHIR R4 Sandbox health data integration for DoctorNow microservices platform.',
    contact: {
      name: 'DoctorNow Engineering Team',
    },
  },
  servers: [
    {
      url: 'http://localhost:3006',
      description: 'Local Development Server (Payment & Insurance Service)',
    },
    {
      url: 'http://localhost:8080/api/v1',
      description: 'API Gateway',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: ['./src/routes/*.js', './src/app.js'],
};

module.exports = swaggerJSDoc(options);
