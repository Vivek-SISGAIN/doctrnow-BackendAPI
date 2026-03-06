const Joi = require('joi');

const createSlotSchema = Joi.object({
  doctorId: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Doctor ID must be a valid UUID',
      'any.required': 'Doctor ID is required'
    }),
  startTime: Joi.date().iso().required()
    .messages({
      'date.base': 'Start time must be a valid date',
      'any.required': 'Start time is required'
    }),
  endTime: Joi.date().iso().greater(Joi.ref('startTime')).required()
    .messages({
      'date.base': 'End time must be a valid date',
      'date.greater': 'End time must be after start time',
      'any.required': 'End time is required'
    }),
  status: Joi.string().valid('AVAILABLE', 'BOOKED', 'CANCELLED', 'BLOCKED').optional()
    .messages({
      'any.only': 'Status must be AVAILABLE, BOOKED, CANCELLED, or BLOCKED'
    })
});

const createBulkSlotsSchema = Joi.object({
  doctorId: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Doctor ID must be a valid UUID',
      'any.required': 'Doctor ID is required'
    }),
  slots: Joi.array().items(
    Joi.object({
      startTime: Joi.date().iso().required(),
      endTime: Joi.date().iso().greater(Joi.ref('startTime')).required(),
      status: Joi.string().valid('AVAILABLE', 'BOOKED', 'CANCELLED', 'BLOCKED').optional()
    })
  ).min(1).required()
    .messages({
      'array.min': 'At least one slot must be provided',
      'any.required': 'Slots array is required'
    })
});

const updateSlotSchema = Joi.object({
  startTime: Joi.date().iso().optional()
    .messages({
      'date.base': 'Start time must be a valid date'
    }),
  endTime: Joi.date().iso().optional()
    .messages({
      'date.base': 'End time must be a valid date'
    }),
  status: Joi.string().valid('AVAILABLE', 'BOOKED', 'CANCELLED', 'BLOCKED').optional()
    .messages({
      'any.only': 'Status must be AVAILABLE, BOOKED, CANCELLED, or BLOCKED'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
}).custom((value, helpers) => {
  if (value.startTime && value.endTime) {
    if (new Date(value.endTime) <= new Date(value.startTime)) {
      return helpers.error('date.greater');
    }
  }
  return value;
});

module.exports = {
  createSlotSchema,
  createBulkSlotsSchema,
  updateSlotSchema
};
