const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DoctorNow Consultation Service API',
      version: '1.0.0',
      description:
        'API documentation for DoctorNow Consultation Service - consultations, notes, and vitals',
      contact: {
        name: 'DoctorNow API Support',
        email: 'support@doctornow.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3005}`,
        description: 'Development server'
      }
    ],
    tags: [
      { name: 'Consultations', description: 'Consultation management' },
      { name: 'Consultation Notes', description: 'Consultation notes' },
      { name: 'Consultation Vitals', description: 'Consultation vitals' },
      { name: 'Health', description: 'Health check endpoints' }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            status: { type: 'string', example: 'error' },
            message: { type: 'string', example: 'An error occurred' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/app.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
