import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Hospital Admin Service API',
      version: '1.0.0',
      description: 'API documentation for DoctorNow Hospital Admin Service - Manages hospital-specific operations including health services and packages.',
      contact: {
        name: 'DoctorNow Support',
        email: 'support@doctornow.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5001',
        description: 'Development server'
      },
      {
        url: 'https://api.doctornow.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Health Services',
        description: 'Operations related to health services (lab tests, imaging, consultations)'
      },
      {
        name: 'Health Packages',
        description: 'Operations related to health packages and their services'
      },
      {
        name: 'System',
        description: 'System health and information endpoints'
      }
    ],
    components: {
      schemas: {
        ServiceType: {
          type: 'string',
          enum: ['LAB_TEST', 'IMAGING', 'CONSULTATION'],
          description: 'Type of health service'
        },
        ServiceStatus: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE'],
          description: 'Status of health service'
        },
        HealthService: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for the health service'
            },
            name: {
              type: 'string',
              description: 'Name of the health service'
            },
            type: {
              $ref: '#/components/schemas/ServiceType'
            },
            originalPrice: {
              type: 'number',
              format: 'decimal',
              description: 'Original price of the service'
            },
            finalPrice: {
              type: 'number',
              format: 'decimal',
              description: 'Final price after discount'
            },
            status: {
              $ref: '#/components/schemas/ServiceStatus'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp'
            }
          }
        },
        HealthPackage: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for the health package'
            },
            name: {
              type: 'string',
              description: 'Name of the health package'
            },
            description: {
              type: 'string',
              description: 'Description of the health package'
            },
            originalPrice: {
              type: 'number',
              format: 'decimal',
              description: 'Original price of the package'
            },
            finalPrice: {
              type: 'number',
              format: 'decimal',
              description: 'Final price after discount'
            },
            discountPct: {
              type: 'integer',
              description: 'Discount percentage (0-100)'
            },
            validityDays: {
              type: 'integer',
              description: 'Number of days the package is valid'
            },
            services: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  serviceId: {
                    type: 'string',
                    format: 'uuid'
                  },
                  service: {
                    $ref: '#/components/schemas/HealthService'
                  }
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp'
            }
          }
        },
        CreateServiceRequest: {
          type: 'object',
          required: ['name', 'type', 'originalPrice', 'finalPrice'],
          properties: {
            name: {
              type: 'string',
              example: 'Complete Blood Count (CBC)'
            },
            type: {
              $ref: '#/components/schemas/ServiceType',
              example: 'LAB_TEST'
            },
            originalPrice: {
              type: 'number',
              example: 1000
            },
            finalPrice: {
              type: 'number',
              example: 800
            },
            status: {
              $ref: '#/components/schemas/ServiceStatus',
              example: 'ACTIVE'
            }
          }
        },
        CreatePackageRequest: {
          type: 'object',
          required: ['name', 'description', 'originalPrice', 'finalPrice', 'discountPct', 'validityDays'],
          properties: {
            name: {
              type: 'string',
              example: 'Full Body Checkup'
            },
            description: {
              type: 'string',
              example: 'Comprehensive health checkup including lab tests and imaging'
            },
            originalPrice: {
              type: 'number',
              example: 5000
            },
            finalPrice: {
              type: 'number',
              example: 4000
            },
            discountPct: {
              type: 'integer',
              example: 20
            },
            validityDays: {
              type: 'integer',
              example: 30
            },
            serviceIds: {
              type: 'array',
              items: {
                type: 'string',
                format: 'uuid'
              },
              example: []
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string'
            },
            data: {
              type: 'object'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string'
            },
            errors: {
              type: 'object'
            }
          }
        }
      },
      responses: {
        BadRequest: {
          description: 'Bad request - Invalid input data',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              }
            }
          }
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ErrorResponse'
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts', './src/routes/*.js']
};

export const swaggerSpec = swaggerJsdoc(options);
