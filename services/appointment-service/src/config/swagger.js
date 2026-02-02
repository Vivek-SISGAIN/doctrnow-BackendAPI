const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DoctorNow Appointment Service API',
      version: '1.0.0',
      description:
        'API documentation for DoctorNow Appointment Service - manage appointments, slots, and scheduling',
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
        url: 'http://localhost:3003',
        description: 'Development server'
      },
      {
        url: 'https://api.doctornow.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Appointments',
        description: 'Appointment management'
      },
      {
        name: 'Slots',
        description: 'Slot management'
      },
      {
        name: 'Health',
        description: 'Health check endpoints'
      }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            status: {
              type: 'string',
              example: 'error'
            },
            message: {
              type: 'string',
              example: 'An error occurred'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string'
                  },
                  message: {
                    type: 'string'
                  }
                }
              }
            }
          }
        },
        Appointment: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Appointment ID'
            },
            patientId: {
              type: 'string',
              format: 'uuid',
              description: 'Patient ID'
            },
            doctorId: {
              type: 'string',
              format: 'uuid',
              description: 'Doctor ID'
            },
            slotId: {
              type: 'string',
              format: 'uuid',
              description: 'Slot ID'
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
              description: 'Appointment status'
            },
            paymentStatus: {
              type: 'string',
              enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
              description: 'Payment status'
            },
            consultationType: {
              type: 'string',
              enum: ['VIDEO', 'AUDIO', 'CHAT'],
              description: 'Type of consultation'
            },
            reason: {
              type: 'string',
              description: 'Reason for appointment'
            },
            notes: {
              type: 'string',
              description: 'Additional notes'
            },
            familyMemberId: {
              type: 'string',
              format: 'uuid',
              nullable: true,
              description: 'Family member ID if booking for family member'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Slot: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Slot ID'
            },
            doctorId: {
              type: 'string',
              format: 'uuid',
              description: 'Doctor ID'
            },
            startTime: {
              type: 'string',
              format: 'date-time',
              description: 'Slot start time'
            },
            endTime: {
              type: 'string',
              format: 'date-time',
              description: 'Slot end time'
            },
            status: {
              type: 'string',
              enum: ['AVAILABLE', 'BOOKED', 'CANCELLED', 'BLOCKED'],
              description: 'Slot status'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
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
