const Joi = require('joi');

const medicationSchema = Joi.object({
  name: Joi.string().required(),
  strength: Joi.string().required(),
  dosage: Joi.string().required(),
  frequency: Joi.string().required(),
  duration: Joi.string().required(),
  isControlled: Joi.boolean().optional(),
  type: Joi.string().optional(),
  instructions: Joi.string().optional()
});

const createPrescriptionSchema = Joi.object({
  appointmentId: Joi.string().uuid().optional(),
  consultationId: Joi.string().uuid().optional(),
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().required(),
  diagnosis: Joi.string().max(500).optional(),
  medications: Joi.array().items(medicationSchema).min(1).required(),
  precautions: Joi.array().items(Joi.string()).optional(),
  dietRecommendations: Joi.array().items(Joi.string()).optional()
});

const updatePrescriptionSchema = Joi.object({
  diagnosis: Joi.string().max(500).optional(),
  medications: Joi.array().items(medicationSchema).optional(),
  precautions: Joi.array().items(Joi.string()).optional(),
  dietRecommendations: Joi.array().items(Joi.string()).optional(),
  lifecycle: Joi.string().valid('DRAFT', 'SIGNED', 'SENT', 'VIEWED').optional()
}).min(1);

module.exports = {
  createPrescriptionSchema,
  updatePrescriptionSchema
};
