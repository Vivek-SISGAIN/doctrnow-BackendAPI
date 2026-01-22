const Joi = require('joi');

const createFamilyMemberSchema = Joi.object({
  patientId: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Invalid patient ID format',
      'any.required': 'Patient ID is required'
    }),
  relationshipType: Joi.string().valid('SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'GRANDFATHER', 'GRANDMOTHER', 'GRANDSON', 'GRANDDAUGHTER', 'OTHER').required()
    .messages({
      'any.only': 'Invalid relationship type',
      'any.required': 'Relationship type is required'
    }),
  firstName: Joi.string().min(2).max(50).required()
    .messages({
      'any.required': 'First name is required'
    }),
  lastName: Joi.string().min(2).max(50).required()
    .messages({
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
  emiratesId: Joi.string().pattern(/^784-[0-9]{4}-[0-9]{7}-[0-9]$/).optional().allow(null),
  nationality: Joi.string().min(2).max(50).required()
    .messages({
      'any.required': 'Nationality is required'
    }),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).optional().allow(null),
  email: Joi.string().email().optional().allow(null),
  bloodGroup: Joi.string().valid('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG').optional().allow(null),
  isEmergencyContact: Joi.boolean().optional()
});

const updateFamilyMemberSchema = Joi.object({
  relationshipType: Joi.string().valid('SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'GRANDFATHER', 'GRANDMOTHER', 'GRANDSON', 'GRANDDAUGHTER', 'OTHER').optional(),
  firstName: Joi.string().min(2).max(50).optional(),
  lastName: Joi.string().min(2).max(50).optional(),
  dateOfBirth: Joi.date().max('now').optional(),
  gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').optional(),
  emiratesId: Joi.string().pattern(/^784-[0-9]{4}-[0-9]{7}-[0-9]$/).optional().allow(null),
  nationality: Joi.string().min(2).max(50).optional(),
  mobileNumber: Joi.string().pattern(/^[0-9]{10,15}$/).optional().allow(null),
  email: Joi.string().email().optional().allow(null),
  bloodGroup: Joi.string().valid('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG').optional().allow(null),
  isEmergencyContact: Joi.boolean().optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

module.exports = {
  createFamilyMemberSchema,
  updateFamilyMemberSchema
};
