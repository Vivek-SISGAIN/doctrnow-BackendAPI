const Joi = require('joi');

const testResultSchema = Joi.object({
  name: Joi.string().required(),
  value: Joi.string().required(),
  unit: Joi.string().required(),
  referenceRange: Joi.string().required(),
  flag: Joi.string().valid('normal', 'abnormal', 'critical').required(),
  previousValue: Joi.string().optional(),
  previousDate: Joi.string().optional(),
});

const createLabReportSchema = Joi.object({
  patientId: Joi.string().uuid().required(),
  doctorId: Joi.string().uuid().required(),
  appointmentId: Joi.string().uuid().optional(),
  consultationId: Joi.string().uuid().optional(),
  reportId: Joi.string().optional(),
  consultationDate: Joi.string().isoDate().optional(),
  consultationTime: Joi.string().optional(),
  orderedTests: Joi.array().items(Joi.string()).default([]),
  status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SENT').default('PENDING'),
  priority: Joi.string().valid('ROUTINE', 'URGENT', 'STAT').default('ROUTINE'),
  notes: Joi.string().max(2000).optional(),
  results: Joi.array().items(testResultSchema).optional(),
});

const updateLabReportSchema = Joi.object({
  consultationDate: Joi.string().isoDate().optional(),
  consultationTime: Joi.string().optional(),
  orderedTests: Joi.array().items(Joi.string()).optional(),
  status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SENT').optional(),
  priority: Joi.string().valid('ROUTINE', 'URGENT', 'STAT').optional(),
  resultDate: Joi.string().isoDate().optional(),
  notes: Joi.string().max(2000).optional(),
  results: Joi.array().items(testResultSchema).optional(),
  isReviewed: Joi.boolean().optional(),
  reviewedAt: Joi.string().isoDate().optional(),
  reviewComments: Joi.string().max(2000).optional(),
  sentToPatient: Joi.boolean().optional(),
  sentAt: Joi.string().isoDate().optional(),
}).min(1);

module.exports = {
  createLabReportSchema,
  updateLabReportSchema,
};
