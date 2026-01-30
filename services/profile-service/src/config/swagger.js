const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DoctorNow Profile Service API',
      version: '1.0.0',
      description:
        'API documentation for DoctorNow Profile Service - manage patients, doctors, hospital admins, super admins, and family members',
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
        url: 'http://localhost:5000',
        description: 'Development server'
      },
      {
        url: 'https://api.doctornow.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Patients',
        description: 'Patient profile management'
      },
      {
        name: 'Family Members',
        description: 'Family member profile management'
      },
      {
        name: 'Doctors',
        description: 'Doctor profile management'
      },
      {
        name: 'Hospital Admins',
        description: 'Hospital administrator profile management'
      },
      {
        name: 'Super Admins',
        description: 'Super administrator profile management'
      },
      {
        name: 'Health',
        description: 'Health check endpoints'
      },
      {
        name: 'Insurance Providers',
        description: 'Insurance & TPA provider management'
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
        Patient: {
          type: 'object',
          required: [
            'userId',
            'mobileNumber',
            'email',
            'firstName',
            'lastName',
            'dateOfBirth',
            'gender',
            'emiratesId',
            'nationality'
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Patient ID'
            },
            userId: {
              type: 'string',
              description: 'User ID from auth service'
            },
            mobileNumber: {
              type: 'string',
              example: '+971501234567'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'patient@example.com'
            },
            firstName: {
              type: 'string',
              example: 'John'
            },
            lastName: {
              type: 'string',
              example: 'Doe'
            },
            dateOfBirth: {
              type: 'string',
              format: 'date',
              example: '1990-01-15'
            },
            gender: {
              type: 'string',
              enum: ['MALE', 'FEMALE', 'OTHER']
            },
            emiratesId: {
              type: 'string',
              example: '784-1990-1234567-1'
            },
            nationality: {
              type: 'string',
              example: 'UAE'
            },
            bloodGroup: {
              type: 'string',
              enum: ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG']
            },
            maritalStatus: {
              type: 'string',
              enum: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']
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
        FamilyMember: {
          type: 'object',
          required: [
            'patientId',
            'relationshipType',
            'firstName',
            'lastName',
            'dateOfBirth',
            'gender',
            'nationality'
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            patientId: {
              type: 'string',
              description: 'Patient ID this family member belongs to'
            },
            relationshipType: {
              type: 'string',
              enum: [
                'SPOUSE',
                'FATHER',
                'MOTHER',
                'SON',
                'DAUGHTER',
                'BROTHER',
                'SISTER',
                'GRANDFATHER',
                'GRANDMOTHER',
                'GRANDSON',
                'GRANDDAUGHTER',
                'OTHER'
              ]
            },
            firstName: {
              type: 'string',
              example: 'Jane'
            },
            lastName: {
              type: 'string',
              example: 'Doe'
            },
            dateOfBirth: {
              type: 'string',
              format: 'date'
            },
            gender: {
              type: 'string',
              enum: ['MALE', 'FEMALE', 'OTHER']
            },
            emiratesId: {
              type: 'string',
              nullable: true
            },
            nationality: {
              type: 'string'
            },
            mobileNumber: {
              type: 'string',
              nullable: true
            },
            email: {
              type: 'string',
              format: 'email',
              nullable: true
            },
            bloodGroup: {
              type: 'string',
              enum: ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'],
              nullable: true
            },
            isEmergencyContact: {
              type: 'boolean',
              default: false
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
        Doctor: {
          type: 'object',
          required: [
            'userId',
            'fullName',
            'email',
            'phoneNumber',
            'gender',
            'nationality',
            'emiratesId',
            'primarySpecialization',
            'licenseNumber',
            'licenseType',
            'licenseExpiry',
            'yearsOfExperience',
            'medicalDegree',
            'university'
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            userId: {
              type: 'string'
            },
            fullName: {
              type: 'string',
              example: 'Dr. Ahmed Hassan'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            phoneNumber: {
              type: 'string'
            },
            gender: {
              type: 'string',
              enum: ['MALE', 'FEMALE', 'OTHER']
            },
            nationality: {
              type: 'string'
            },
            emiratesId: {
              type: 'string'
            },
            primarySpecialization: {
              type: 'string',
              example: 'Cardiology'
            },
            subSpecialization: {
              type: 'string',
              nullable: true
            },
            licenseNumber: {
              type: 'string'
            },
            licenseType: {
              type: 'string',
              enum: [
                'FULL_LICENSE',
                'TEMPORARY_LICENSE',
                'SPECIALIST_LICENSE',
                'CONSULTANT_LICENSE'
              ]
            },
            licenseExpiry: {
              type: 'string',
              format: 'date'
            },
            yearsOfExperience: {
              type: 'integer'
            },
            medicalDegree: {
              type: 'string'
            },
            university: {
              type: 'string'
            },
            languagesSpoken: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            servicesOffered: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            certifications: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            professionalMemberships: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            professionalBio: {
              type: 'string'
            },
            workingDays: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
              }
            },
            workingHoursFrom: {
              type: 'string',
              example: '09:00'
            },
            workingHoursTo: {
              type: 'string',
              example: '17:00'
            },
            consultationDuration: {
              type: 'integer',
              description: 'Duration in minutes'
            },
            videoConsultationFee: {
              type: 'number',
              format: 'decimal'
            },
            phoneConsultationFee: {
              type: 'number',
              format: 'decimal'
            },
            followUpFee: {
              type: 'number',
              format: 'decimal'
            },
            hospitalSharePercent: {
              type: 'integer'
            },
            platformSharePercent: {
              type: 'integer'
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
        HospitalAdmin: {
          type: 'object',
          required: [
            'userId',
            'fullName',
            'email',
            'phoneNumber',
            'gender',
            'nationality',
            'emiratesId',
            'hospitalName',
            'hospitalId',
            'position'
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            userId: {
              type: 'string'
            },
            fullName: {
              type: 'string'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            phoneNumber: {
              type: 'string'
            },
            gender: {
              type: 'string',
              enum: ['MALE', 'FEMALE', 'OTHER']
            },
            nationality: {
              type: 'string'
            },
            emiratesId: {
              type: 'string'
            },
            hospitalName: {
              type: 'string'
            },
            hospitalId: {
              type: 'string'
            },
            position: {
              type: 'string'
            },
            department: {
              type: 'string',
              nullable: true
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
        SuperAdmin: {
          type: 'object',
          required: [
            'userId',
            'fullName',
            'email',
            'phoneNumber',
            'gender',
            'nationality',
            'emiratesId'
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            userId: {
              type: 'string'
            },
            fullName: {
              type: 'string'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            phoneNumber: {
              type: 'string'
            },
            gender: {
              type: 'string',
              enum: ['MALE', 'FEMALE', 'OTHER']
            },
            nationality: {
              type: 'string'
            },
            emiratesId: {
              type: 'string'
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
        InsuranceProvider: {
          type: 'object',
          required: [
            'providerName',
            'providerType',
            'contactEmail',
            'contactPhone',
            'networkType',
            'claimSubmissionMethod',
            'address',
            'supportedServices'
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: 'd4a5f6b2-8c1d-4e6b-a12c-5f1b9b8c2345'
            },
            providerName: {
              type: 'string',
              example: 'AXA Gulf Insurance'
            },
            providerType: {
              type: 'string',
              enum: ['INSURANCE_COMPANY', 'TPA'],
              example: 'INSURANCE_COMPANY'
            },
            contactEmail: {
              type: 'string',
              format: 'email',
              example: 'support@axa-gulf.com'
            },
            contactPhone: {
              type: 'string',
              example: '+97144556677'
            },
            website: {
              type: 'string',
              example: 'https://www.axa-gulf.com',
              nullable: true
            },
            networkType: {
              type: 'string',
              enum: ['IN_NETWORK', 'OUT_NETWORK', 'BOTH'],
              example: 'BOTH'
            },
            claimSubmissionMethod: {
              type: 'string',
              enum: ['ONLINE_PORTAL', 'EMAIL', 'MANUAL', 'API'],
              example: 'ONLINE_PORTAL'
            },
            avgProcessingDays: {
              type: 'integer',
              example: 7,
              nullable: true
            },
            address: {
              type: 'string',
              example: 'Level 12, Dubai International Financial Centre, Dubai, UAE'
            },
            supportedServices: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'CONSULTATION',
                  'LAB_TESTS',
                  'PACKAGES',
                  'DIAGNOSTICS',
                  'HOME_CARE',
                  'SURGERY',
                  'EMERGENCY'
                ]
              },
              example: ['CONSULTATION', 'LAB_TESTS', 'DIAGNOSTICS']
            },
            note: {
              type: 'string',
              example: 'Fast claim processing for in-network hospitals',
              nullable: true
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-01T10:30:00Z'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-10T15:45:00Z'
            }
          }
        },

        CreateInsuranceProvider: {
          type: 'object',
          required: [
            'providerName',
            'providerType',
            'contactEmail',
            'contactPhone',
            'networkType',
            'claimSubmissionMethod',
            'address',
            'supportedServices'
          ],
          properties: {
            providerName: {
              type: 'string',
              example: 'MedNet TPA'
            },
            providerType: {
              type: 'string',
              enum: ['INSURANCE_COMPANY', 'TPA'],
              example: 'TPA'
            },
            contactEmail: {
              type: 'string',
              format: 'email',
              example: 'claims@mednet.com'
            },
            contactPhone: {
              type: 'string',
              example: '+97143210000'
            },
            website: {
              type: 'string',
              example: 'https://www.mednet.com'
            },
            networkType: {
              type: 'string',
              enum: ['IN_NETWORK', 'OUT_NETWORK', 'BOTH'],
              example: 'IN_NETWORK'
            },
            claimSubmissionMethod: {
              type: 'string',
              enum: ['ONLINE_PORTAL', 'EMAIL', 'MANUAL', 'API'],
              example: 'API'
            },
            avgProcessingDays: {
              type: 'integer',
              example: 5
            },
            address: {
              type: 'string',
              example: 'Abu Dhabi Global Market, Abu Dhabi, UAE'
            },
            supportedServices: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['CONSULTATION', 'SURGERY', 'EMERGENCY']
            },
            note: {
              type: 'string',
              example: 'Emergency services require pre-approval'
            }
          }
        },

        UpdateInsuranceProvider: {
          type: 'object',
          properties: {
            providerName: {
              type: 'string',
              example: 'AXA Gulf Insurance – UAE'
            },
            contactEmail: {
              type: 'string',
              format: 'email',
              example: 'helpdesk@axa-gulf.com'
            },
            contactPhone: {
              type: 'string',
              example: '+97140000000'
            },
            networkType: {
              type: 'string',
              enum: ['IN_NETWORK', 'OUT_NETWORK', 'BOTH']
            },
            claimSubmissionMethod: {
              type: 'string',
              enum: ['ONLINE_PORTAL', 'EMAIL', 'MANUAL', 'API']
            },
            avgProcessingDays: {
              type: 'integer',
              example: 6
            },
            supportedServices: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            note: {
              type: 'string',
              example: 'Updated SLA as of 2025'
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
