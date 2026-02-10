const Joi = require('joi');

const createConsultationSchema = Joi.object({
  appointmentId: Joi.string().uuid().required(),
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().required(),
  status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW').optional(),
  type: Joi.string().valid('VIDEO', 'AUDIO', 'CHAT').optional(),
  diagnosis: Joi.string().max(500).optional(),
  followUp: Joi.string().max(500).optional()
});

const updateConsultationSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW').optional(),
  diagnosis: Joi.string().max(500).optional(),
  followUp: Joi.string().max(500).optional(),
  type: Joi.string().valid('VIDEO', 'AUDIO', 'CHAT').optional()
}).min(1);

const createNoteSchema = Joi.object({
  consultationId: Joi.string().uuid().required(),
  content: Joi.string().required(),
  createdBy: Joi.string().required()
});

const updateNoteSchema = Joi.object({
  content: Joi.string().required()
});

const createVitalsSchema = Joi.object({
  consultationId: Joi.string().uuid().required(),
  bloodPressure: Joi.string().optional(),
  pulse: Joi.string().optional(),
  temperature: Joi.string().optional(),
  spo2: Joi.string().optional(),
  weight: Joi.string().optional(),
  height: Joi.string().optional(),
  notes: Joi.string().max(1000).optional()
});

module.exports = {
  createConsultationSchema,
  updateConsultationSchema,
  createNoteSchema,
  updateNoteSchema,
  createVitalsSchema
};
