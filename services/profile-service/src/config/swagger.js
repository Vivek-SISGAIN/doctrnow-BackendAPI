const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DoctorNow Profile Service API',
      version: '1.0.0',
      description: 'API documentation for DoctorNow Profile Service - manage patients, doctors, hospital admins, super admins, and family members',
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
          required: ['userId', 'mobileNumber', 'email', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'emiratesId', 'nationality'],
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
          required: ['patientId', 'relationshipType', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'nationality'],
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
              enum: ['SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'GRANDFATHER', 'GRANDMOTHER', 'GRANDSON', 'GRANDDAUGHTER', 'OTHER']
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
          required: ['userId', 'fullName', 'email', 'phoneNumber', 'gender', 'nationality', 'emiratesId', 'primarySpecialization', 'licenseNumber', 'licenseType', 'licenseExpiry', 'yearsOfExperience', 'medicalDegree', 'university'],
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
              enum: ['FULL_LICENSE', 'TEMPORARY_LICENSE', 'SPECIALIST_LICENSE', 'CONSULTANT_LICENSE']
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
          required: ['userId', 'fullName', 'email', 'phoneNumber', 'gender', 'nationality', 'emiratesId', 'hospitalName', 'hospitalId', 'position'],
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
          required: ['userId', 'fullName', 'email', 'phoneNumber', 'gender', 'nationality', 'emiratesId'],
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
        }
      }
    }
  },
  apis: ['./src/routes/*.js', './src/app.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
