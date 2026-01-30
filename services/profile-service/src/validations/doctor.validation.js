const Joi = require('joi');

const createDoctorSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  profileImage: Joi.string().uri().required(),
  fullName: Joi.string().min(3).max(100).required().messages({
    'any.required': 'Full name is required'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  }),
  mobile: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be 10-15 digits',
      'any.required': 'Phone number is required'
    }),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').required().messages({
    'any.only': 'Gender must be MALE, FEMALE, or OTHER',
    'any.required': 'Gender is required'
  }),
  nationality: Joi.string().min(2).max(50).required().messages({
    'any.required': 'Nationality is required'
  }),
  emiratesId: Joi.string()
    .pattern(/^784-[0-9]{4}-[0-9]{7}-[0-9]$/)
    .required()
    .messages({
      'string.pattern.base': 'Emirates ID must be in format 784-XXXX-XXXXXXX-X',
      'any.required': 'Emirates ID is required'
    }),
  primarySpecialization: Joi.string().min(2).max(100).required().messages({
    'any.required': 'Primary specialization is required'
  }),
  subSpecialization: Joi.string().max(100).optional().allow(null),
  licenseNumber: Joi.string().min(5).max(50).required().messages({
    'any.required': 'License number is required'
  }),
  licenseType: Joi.string().valid('DHA', 'HAAD').required().messages({
    'any.only': 'Invalid license type',
    'any.required': 'License type is required'
  }),
  licenseExpiry: Joi.date().min('now').required().messages({
    'date.min': 'License expiry date must be in the future',
    'any.required': 'License expiry date is required'
  }),
  yearsOfExperience: Joi.number().integer().min(0).max(70).required().messages({
    'number.min': 'Years of experience cannot be negative',
    'any.required': 'Years of experience is required'
  }),
  medicalDegree: Joi.string().min(2).max(100).required().messages({
    'any.required': 'Medical degree is required'
  }),
  university: Joi.string().min(2).max(200).required().messages({
    'any.required': 'University is required'
  }),
  languagesSpoken: Joi.array().items(Joi.string()).min(1).required().messages({
    'array.min': 'At least one language must be specified',
    'any.required': 'Languages spoken is required'
  }),
  servicesOffered: Joi.array().items(Joi.string()).min(1).required().messages({
    'array.min': 'At least one service must be specified',
    'any.required': 'Services offered is required'
  }),
  certifications: Joi.array().items(Joi.string()).default([]),
  professionalMemberships: Joi.array().items(Joi.string()).default([]),
  professionalBio: Joi.string().min(50).max(2000).required().messages({
    'string.min': 'Professional bio must be at least 50 characters',
    'any.required': 'Professional bio is required'
  }),
  workingDays: Joi.array()
    .items(
      Joi.string().valid(
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
        'SUNDAY'
      )
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one working day must be specified',
      'any.required': 'Working days is required'
    }),
  workingHoursFrom: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .required()
    .messages({
      'string.pattern.base': 'Working hours from must be in HH:MM format',
      'any.required': 'Working hours from is required'
    }),
  workingHoursTo: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .required()
    .messages({
      'string.pattern.base': 'Working hours to must be in HH:MM format',
      'any.required': 'Working hours to is required'
    }),
  consultationDuration: Joi.number().integer().min(5).max(180).required().messages({
    'number.min': 'Consultation duration must be at least 5 minutes',
    'number.max': 'Consultation duration cannot exceed 180 minutes',
    'any.required': 'Consultation duration is required'
  }),
  videoConsultationFee: Joi.number().min(0).required().messages({
    'number.min': 'Video consultation fee cannot be negative',
    'any.required': 'Video consultation fee is required'
  }),
  phoneConsultationFee: Joi.number().min(0).required().messages({
    'number.min': 'Phone consultation fee cannot be negative',
    'any.required': 'Phone consultation fee is required'
  }),
  followUpFee: Joi.number().min(0).required().messages({
    'number.min': 'Follow-up fee cannot be negative',
    'any.required': 'Follow-up fee is required'
  }),
  hospitalSharePercent: Joi.number().integer().min(0).max(100).required().messages({
    'number.min': 'Hospital share percent must be between 0 and 100',
    'number.max': 'Hospital share percent must be between 0 and 100',
    'any.required': 'Hospital share percent is required'
  }),
  platformSharePercent: Joi.number().integer().min(0).max(100).required().messages({
    'number.min': 'Platform share percent must be between 0 and 100',
    'number.max': 'Platform share percent must be between 0 and 100',
    'any.required': 'Platform share percent is required'
  })
}).custom((value, helpers) => {
  // Validate that hospital share + platform share <= 100
  if (value.hospitalSharePercent + value.platformSharePercent > 100) {
    return helpers.error('custom.sharePercentTotal', {
      message: 'Hospital share and platform share combined cannot exceed 100%'
    });
  }
  return value;
});

const updateDoctorSchema = Joi.object({
  userId: Joi.string().uuid().optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'PENDING').optional(),
  fullName: Joi.string().min(3).max(100).optional(),
  email: Joi.string().email().optional(),
  mobile: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .optional(),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').optional(),
  nationality: Joi.string().min(2).max(50).optional(),
  emiratesId: Joi.string()
    .pattern(/^784-[0-9]{4}-[0-9]{7}-[0-9]$/)
    .optional(),
  primarySpecialization: Joi.string().min(2).max(100).optional(),
  subSpecialization: Joi.string().max(100).optional().allow(null),
  licenseNumber: Joi.string().min(5).max(50).optional(),
  licenseType: Joi.string()
    .valid('FULL_LICENSE', 'TEMPORARY_LICENSE', 'SPECIALIST_LICENSE', 'CONSULTANT_LICENSE')
    .optional(),
  licenseExpiry: Joi.date().min('now').optional(),
  yearsOfExperience: Joi.number().integer().min(0).max(70).optional(),
  medicalDegree: Joi.string().min(2).max(100).optional(),
  university: Joi.string().min(2).max(200).optional(),
  languagesSpoken: Joi.array().items(Joi.string()).min(1).optional(),
  servicesOffered: Joi.array().items(Joi.string()).min(1).optional(),
  certifications: Joi.array().items(Joi.string()).optional(),
  professionalMemberships: Joi.array().items(Joi.string()).optional(),
  professionalBio: Joi.string().min(50).max(2000).optional(),
  workingDays: Joi.array()
    .items(
      Joi.string().valid(
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
        'SUNDAY'
      )
    )
    .min(1)
    .optional(),
  workingHoursFrom: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  workingHoursTo: Joi.string()
    .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  consultationDuration: Joi.number().integer().min(5).max(180).optional(),
  videoConsultationFee: Joi.number().min(0).optional(),
  phoneConsultationFee: Joi.number().min(0).optional(),
  followUpFee: Joi.number().min(0).optional(),
  hospitalSharePercent: Joi.number().integer().min(0).max(100).optional(),
  platformSharePercent: Joi.number().integer().min(0).max(100).optional()
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided for update'
  });

module.exports = {
  createDoctorSchema,
  updateDoctorSchema
};
