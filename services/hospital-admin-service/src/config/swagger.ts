import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',

    info: {
      title: 'DoctorNow Hospital Admin API',
      version: '1.0.0',
      description:
        'API documentation for DoctorNow Hospital Admin Service. Manages health services, packages, and doctor profiles.',
      contact: {
        name: 'DoctorNow Support',
        email: 'support@doctornow.com'
      }
    },

    servers: [
      {
        url: 'http://localhost:3009',
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
        description: 'Operations related to health services'
      },
      {
        name: 'Health Packages',
        description: 'Operations related to health packages'
      },
      {
        name: 'Doctors',
        description: 'Doctor profile management'
      },
      {
        name: 'System',
        description: 'System health endpoints'
      }
    ],

    components: {
      /* =======================
         SECURITY
      ======================= */
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },

      /* =======================
         SCHEMAS
      ======================= */
      schemas: {
        /* ===== ENUMS ===== */
        ServiceType: {
          type: 'string',
          enum: ['LAB_TEST', 'IMAGING', 'CONSULTATION']
        },

        ServiceStatus: {
          type: 'string',
          enum: ['ACTIVE', 'INACTIVE']
        },

        DoctorGender: {
          type: 'string',
          enum: ['MALE', 'FEMALE', 'OTHER']
        },

        LicenseType: {
          type: 'string',
          enum: ['DHA', 'MOH', 'HAAD']
        },

        WorkingDay: {
          type: 'string',
          enum: [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY'
          ]
        },

        /* ===== HEALTH SERVICE ===== */
        HealthService: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { $ref: '#/components/schemas/ServiceType' },
            originalPrice: { type: 'number' },
            finalPrice: { type: 'number' },
            status: { $ref: '#/components/schemas/ServiceStatus' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },

        /* ===== HEALTH PACKAGE ===== */
        HealthPackage: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            originalPrice: { type: 'number' },
            finalPrice: { type: 'number' },
            discountPct: { type: 'integer' },
            validityDays: { type: 'integer' },
            services: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/HealthService'
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },

        /* ===== CREATE SERVICE ===== */
        CreateServiceRequest: {
          type: 'object',
          required: ['name', 'type', 'originalPrice', 'finalPrice'],
          properties: {
            name: { type: 'string', example: 'Complete Blood Count (CBC)' },
            type: { $ref: '#/components/schemas/ServiceType' },
            originalPrice: { type: 'number', example: 1000 },
            finalPrice: { type: 'number', example: 800 },
            status: { $ref: '#/components/schemas/ServiceStatus' }
          }
        },

        /* ===== CREATE PACKAGE ===== */
        CreatePackageRequest: {
          type: 'object',
          required: ['name', 'description', 'originalPrice', 'finalPrice', 'discountPct', 'validityDays'],
          properties: {
            name: { type: 'string', example: 'Full Body Checkup' },
            description: { type: 'string' },
            originalPrice: { type: 'number', example: 5000 },
            finalPrice: { type: 'number', example: 4000 },
            discountPct: { type: 'integer', example: 20 },
            validityDays: { type: 'integer', example: 30 },
            serviceIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' }
            }
          }
        },

        /* ===== CREATE DOCTOR ===== */
        CreateDoctorRequest: {
          type: 'object',
          required: [
            'fullName',
            'email',
            'mobile',
            'password',
            'role',
            'tenantId',
            'gender',
            'nationality',
            'emiratesId',
            'primarySpecialization',
            'licenseNumber',
            'licenseType',
            'licenseExpiry',
            'yearsOfExperience',
            'medicalDegree',
            'university',
            'professionalBio',
            'workingHoursFrom',
            'workingHoursTo',
            'consultationDuration',
            'videoConsultationFee',
            'phoneConsultationFee',
            'followUpFee',
            'hospitalSharePercent',
            'platformSharePercent'
          ],

          properties: {
            fullName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            mobile: { type: 'string' },
            password: { type: 'string', format: 'password' },
            role: { type: 'string' },
            tenantId: { type: 'string', format: 'uuid' },

            gender: { $ref: '#/components/schemas/DoctorGender' },
            nationality: { type: 'string' },
            emiratesId: { type: 'string' },

            primarySpecialization: { type: 'string' },
            subSpecialization: { type: 'string' },

            licenseNumber: { type: 'string' },
            licenseType: { $ref: '#/components/schemas/LicenseType' },
            licenseExpiry: { type: 'string', format: 'date-time' },

            yearsOfExperience: { type: 'integer' },
            medicalDegree: { type: 'string' },
            university: { type: 'string' },

            profileImage: { type: 'string', format: 'uri' },

            languagesSpoken: {
              type: 'array',
              items: { type: 'string' }
            },
            servicesOffered: {
              type: 'array',
              items: { type: 'string' }
            },
            certifications: {
              type: 'array',
              items: { type: 'string' }
            },
            professionalMemberships: {
              type: 'array',
              items: { type: 'string' }
            },

            professionalBio: { type: 'string' },

            workingDays: {
              type: 'array',
              items: { $ref: '#/components/schemas/WorkingDay' }
            },
            workingHoursFrom: { type: 'string' },
            workingHoursTo: { type: 'string' },

            consultationDuration: { type: 'integer' },
            videoConsultationFee: { type: 'number' },
            phoneConsultationFee: { type: 'number' },
            followUpFee: { type: 'number' },

            hospitalSharePercent: { type: 'integer' },
            platformSharePercent: { type: 'integer' }
          },

          /** 👇 THIS IS THE IMPORTANT PART */
          example: {
            fullName: 'Dr. Ahmed Al Mansoori',
            gender: 'MALE',
            nationality: 'UAE',
            emiratesId: '784-1985-1234567-1',

            primarySpecialization: 'Cardiology',
            subSpecialization: 'Interventional Cardiology',

            licenseNumber: 'DHA-CARD-458921',
            licenseType: 'DHA',
            licenseExpiry: '2027-12-31T00:00:00.000Z',

            yearsOfExperience: 12,
            medicalDegree: 'MBBS, MD (Cardiology)',
            university: 'University of Sharjah',
            profileImage: 'https://cdn.doctornow.ae/doctors/ahmed.png',

            languagesSpoken: ['English', 'Arabic'],
            servicesOffered: ['ECG', 'Angioplasty', 'Heart Checkup'],
            certifications: ['ACLS', 'BLS'],
            professionalMemberships: ['Emirates Cardiac Society'],

            professionalBio:
              'Experienced cardiologist specializing in minimally invasive cardiac procedures with over 12 years of clinical practice.',

            workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
            workingHoursFrom: '09:00',
            workingHoursTo: '17:00',
            consultationDuration: 20,

            videoConsultationFee: 250.0,
            phoneConsultationFee: 150.0,
            followUpFee: 100.0,

            hospitalSharePercent: 70,
            platformSharePercent: 30,

            email: 'ahmed.mansoori@hospital.ae',
            mobile: '1501234567',
            password: 'SecurePassword123!',
            role: 'DOCTOR',
            tenantId: '550e8400-e29b-41d4-a716-446655440002'
          }
        },


        /* ===== COMMON RESPONSES ===== */
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        },

        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } }
          }
        }
      },

      responses: {
        BadRequest: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },

  apis: ['./src/routes/*.ts', './src/controllers/*.ts']
};

export const swaggerSpec = swaggerJsdoc(options);
