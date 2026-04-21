const Joi = require('joi');

const createConsultationSchema = Joi.object({
  appointmentId: Joi.string().uuid().required(),
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().required(),
  hospitalId: Joi.string().allow('').optional(),
  status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW').optional(),
  type: Joi.string().valid('VIDEO', 'AUDIO', 'CHAT').optional(),
  diagnosis: Joi.string().max(500).optional(),
  followUp: Joi.string().max(500).optional()
});

const joinLobbySchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().required(),
  hospitalId: Joi.string().allow('').optional()
});

const saveHealthDetailsSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().required(),
  hospitalId: Joi.string().allow('').optional(),
  weight: Joi.string().allow('').optional(),
  height: Joi.string().allow('').optional(),
  bloodPressure: Joi.string().allow('').optional(),
  temperature: Joi.string().allow('').optional(),
  pulse: Joi.string().allow('').optional(),
  spo2: Joi.string().allow('').optional(),
  sugarLevel: Joi.string().allow('').optional(),
  consultationReason: Joi.string().max(1000).allow('').optional(),
  allergies: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  criticalConditions: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  medications: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  lifestyleHabits: Joi.string().max(1000).allow('').optional(),
});

const updateConsultationSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW').optional(),
  diagnosis: Joi.string().max(500).optional(),
  followUp: Joi.string().max(500).optional(),
  hospitalId: Joi.string().allow('').optional(),
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
  notes: Joi.string().max(1000).optional(),
  allergies: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  criticalConditions: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  medications: Joi.alternatives().try(Joi.array().items(Joi.string()), Joi.string()).optional(),
  lifestyleHabits: Joi.string().max(1000).allow('').optional(),
});

module.exports = {
  createConsultationSchema,
  joinLobbySchema,
  saveHealthDetailsSchema,
  updateConsultationSchema,
  createNoteSchema,
  updateNoteSchema,
  createVitalsSchema
};
