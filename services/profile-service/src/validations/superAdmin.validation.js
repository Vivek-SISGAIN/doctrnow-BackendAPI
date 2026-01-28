const Joi = require('joi');

const createSuperAdminSchema = Joi.object({
  fullName: Joi.string().min(3).max(100).required()
    .messages({
      'any.required': 'Full name is required'
    }),
  email: Joi.string().email().required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  phoneNumber: Joi.string().pattern(/^[0-9]{10,15}$/).required()
    .messages({
      'string.pattern.base': 'Phone number must be 10-15 digits',
      'any.required': 'Phone number is required'
    }),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').required()
    .messages({
      'any.only': 'Gender must be MALE, FEMALE, or OTHER',
      'any.required': 'Gender is required'
    }),
  nationality: Joi.string().min(2).max(50).required()
    .messages({
      'any.required': 'Nationality is required'
    }),
  emiratesId: Joi.string().pattern(/^784-[0-9]{4}-[0-9]{7}-[0-9]$/).required()
    .messages({
      'string.pattern.base': 'Emirates ID must be in format 784-XXXX-XXXXXXX-X',
      'any.required': 'Emirates ID is required'
    })
});

const updateSuperAdminSchema = Joi.object({
  fullName: Joi.string().min(3).max(100).optional(),
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().pattern(/^[0-9]{10,15}$/).optional(),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').optional(),
  nationality: Joi.string().min(2).max(50).optional(),
  emiratesId: Joi.string().pattern(/^784-[0-9]{4}-[0-9]{7}-[0-9]$/).optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

module.exports = {
  createSuperAdminSchema,
  updateSuperAdminSchema
};
