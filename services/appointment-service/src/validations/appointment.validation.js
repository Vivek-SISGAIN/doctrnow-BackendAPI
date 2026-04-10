const Joi = require('joi');

const createAppointmentSchema = Joi.object({
  patientId: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Patient ID must be a valid UUID',
      'any.required': 'Patient ID is required'
    }),
  doctorId: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Doctor ID must be a valid UUID',
      'any.required': 'Doctor ID is required'
    }),
  hospitalId: Joi.string().min(1).required()
    .messages({
      'any.required': 'Hospital ID is required'
    }),
  slotId: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Slot ID must be a valid UUID',
      'any.required': 'Slot ID is required'
    }),
  consultationType: Joi.string().valid('VIDEO', 'AUDIO', 'CHAT').optional()
    .messages({
      'any.only': 'Consultation type must be VIDEO, AUDIO, or CHAT'
    }),
  paymentStatus: Joi.string().valid('PENDING', 'PAID', 'FAILED', 'REFUNDED').optional()
    .messages({
      'any.only': 'Payment status must be PENDING, PAID, FAILED, or REFUNDED'
    }),
  reason: Joi.string().max(500).optional()
    .messages({
      'string.max': 'Reason must not exceed 500 characters'
    }),
  notes: Joi.string().max(1000).optional()
    .messages({
      'string.max': 'Notes must not exceed 1000 characters'
    }),
  familyMemberId: Joi.string().uuid().optional()
    .messages({
      'string.guid': 'Family member ID must be a valid UUID'
    }),
  status: Joi.string().valid('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW').optional()
    .messages({
      'any.only': 'Status must be PENDING, CONFIRMED, COMPLETED, CANCELLED, or NO_SHOW'
    })
});

const updateAppointmentSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW').optional()
    .messages({
      'any.only': 'Status must be PENDING, CONFIRMED, COMPLETED, CANCELLED, or NO_SHOW'
    }),
  paymentStatus: Joi.string().valid('PENDING', 'PAID', 'FAILED', 'REFUNDED').optional()
    .messages({
      'any.only': 'Payment status must be PENDING, PAID, FAILED, or REFUNDED'
    }),
  consultationType: Joi.string().valid('VIDEO', 'AUDIO', 'CHAT').optional()
    .messages({
      'any.only': 'Consultation type must be VIDEO, AUDIO, or CHAT'
    }),
  reason: Joi.string().max(500).optional()
    .messages({
      'string.max': 'Reason must not exceed 500 characters'
    }),
  notes: Joi.string().max(1000).optional()
    .messages({
      'string.max': 'Notes must not exceed 1000 characters'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

const rescheduleAppointmentSchema = Joi.object({
  newSlotId: Joi.string().uuid().required()
    .messages({
      'string.guid': 'New slot ID must be a valid UUID',
      'any.required': 'New slot ID is required'
    })
});

const cancelAppointmentSchema = Joi.object({
  reason: Joi.string().max(500).optional()
    .messages({
      'string.max': 'Reason must not exceed 500 characters'
    })
});

module.exports = {
  createAppointmentSchema,
  updateAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema
};
