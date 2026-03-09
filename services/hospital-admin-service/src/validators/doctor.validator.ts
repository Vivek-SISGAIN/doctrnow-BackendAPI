const Joi = require('joi');

const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const createDoctorSchema = Joi.object({
  fullName: Joi.string().min(3).max(100).required(),

  email: Joi.string().email().required(),

  mobile: Joi.string()
    .pattern(/^[0-9]{8,15}$/)
    .required(),

  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').required(),

  nationality: Joi.string().required(),

  emiratesId: Joi.string().required(),

  primarySpecialization: Joi.string().required(),
  subSpecialization: Joi.string().optional(),

  licenseNumber: Joi.string().required(),

  licenseType: Joi.string().valid('DHA', 'HAAD').required(),

  licenseExpiry: Joi.date().greater('now').required(),

  yearsOfExperience: Joi.number().integer().min(0).max(60).required(),

  medicalDegree: Joi.string().required(),
  university: Joi.string().required(),

  profileImage: Joi.string().uri().required(),

  languagesSpoken: Joi.array().items(Joi.string()).optional(),
  servicesOffered: Joi.array().items(Joi.string()).optional(),
  certifications: Joi.array().items(Joi.string()).optional(),
  professionalMemberships: Joi.array().items(Joi.string()).optional(),

  professionalBio: Joi.string().min(20).required(),

   schedule: Joi.object()
    .pattern(
      Joi.string().valid(
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
        "SUNDAY"
      ),
      Joi.object({
        from: Joi.string().pattern(timePattern).required(),
        to: Joi.string().pattern(timePattern).required(),
      })
    )
    .min(1)
    .required()
    .messages({
      "any.required": "Schedule is required",
    }),
  consultationDuration: Joi.number().integer().min(5).required(),

  videoConsultationFee: Joi.number().min(0).required(),
  phoneConsultationFee: Joi.number().min(0).required(),
  followUpFee: Joi.number().min(0).required(),

  hospitalSharePercent: Joi.number().integer().min(0).max(100).required(),
  platformSharePercent: Joi.number().integer().min(0).max(100).required(),

  role: Joi.string().valid('DOCTOR').required(),

  tenantId: Joi.string().uuid().required(),

  password: Joi.string().min(8).required()
}).custom((value: any, helpers: any) => {
  if (value.hospitalSharePercent + value.platformSharePercent !== 100) {
    return helpers.message('hospitalSharePercent and platformSharePercent must total 100');
  }
  return value;
});

export const updateDoctorStatusSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'INACTIVE').required().messages({
    'any.only': "Status must be 'ACTIVE' or 'INACTIVE'",
    'any.required': 'Status is required'
  })
});

export default createDoctorSchema;
