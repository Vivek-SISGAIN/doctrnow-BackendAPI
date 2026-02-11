const Joi = require('joi');

const createDocumentSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().optional(),
  appointmentId: Joi.string().uuid().optional(),
  consultationId: Joi.string().uuid().optional(),
  name: Joi.string().required(),
  type: Joi.string().valid('LAB_REPORT', 'RADIOLOGY', 'PRESCRIPTION', 'CONSULTATION_NOTES', 'REFERRAL', 'OTHER').required(),
  filePath: Joi.string().allow('').optional().default(''),
  fileSize: Joi.number().integer().min(0).optional().default(0),
  mimeType: Joi.string().optional(),
  uploadedBy: Joi.string().required(),
  description: Joi.string().max(1000).optional()
});

const updateDocumentSchema = Joi.object({
  name: Joi.string().optional(),
  description: Joi.string().max(1000).optional(),
  type: Joi.string().valid('LAB_REPORT', 'RADIOLOGY', 'PRESCRIPTION', 'CONSULTATION_NOTES', 'REFERRAL', 'OTHER').optional()
}).min(1);

module.exports = {
  createDocumentSchema,
  updateDocumentSchema
};
