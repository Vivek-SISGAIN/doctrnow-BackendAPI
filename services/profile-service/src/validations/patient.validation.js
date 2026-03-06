const Joi = require('joi');

const createPatientSchema = Joi.object({
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).required()
    .messages({
      'string.pattern.base': 'Mobile number must be 10-15 digits',
      'any.required': 'Mobile number is required'
    }),
  email: Joi.string().email().required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  firstName: Joi.string().min(2).max(50).required()
    .messages({
      'string.min': 'First name must be at least 2 characters',
      'string.max': 'First name must not exceed 50 characters',
      'any.required': 'First name is required'
    }),
  lastName: Joi.string().min(2).max(50).required()
    .messages({
      'string.min': 'Last name must be at least 2 characters',
      'string.max': 'Last name must not exceed 50 characters',
      'any.required': 'Last name is required'
    }),
  dateOfBirth: Joi.date().max('now').required()
    .messages({
      'date.max': 'Date of birth cannot be in the future',
      'any.required': 'Date of birth is required'
    }),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').required()
    .messages({
      'any.only': 'Gender must be MALE, FEMALE, or OTHER',
      'any.required': 'Gender is required'
    }),
  emiratesId: Joi.string().pattern(/^784-[0-9]{4}-[0-9]{7}(-[0-9])?$/).required()
    .messages({
      'string.pattern.base': 'Emirates ID must be in format 784-XXXX-XXXXXXX-X',
      'any.required': 'Emirates ID is required'
    }),
  nationality: Joi.string().min(2).max(50).required()
    .messages({
      'any.required': 'Nationality is required'
    }),
  bloodGroup: Joi.string().valid('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG').optional(),
  maritalStatus: Joi.string().valid('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED').optional()
});

const updatePatientSchema = Joi.object({
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).optional(),
  email: Joi.string().email().optional(),
  firstName: Joi.string().min(2).max(50).optional(),
  lastName: Joi.string().min(2).max(50).optional(),
  dateOfBirth: Joi.date().max('now').optional(),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').optional(),
  emiratesId: Joi.string().pattern(/^784-[0-9]{4}-[0-9]{7}(-[0-9])?$/).optional(),
  nationality: Joi.string().min(2).max(50).optional(),
  bloodGroup: Joi.string().valid('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG').optional(),
  maritalStatus: Joi.string().valid('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED').optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

module.exports = {
  createPatientSchema,
  updatePatientSchema
};
