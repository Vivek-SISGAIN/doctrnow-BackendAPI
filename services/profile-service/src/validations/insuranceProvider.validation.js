const Joi = require('joi');

const ProviderType = ['INSURANCE_COMPANY', 'TPA'];
const NetworkType = ['IN_NETWORK', 'OUT_NETWORK', 'BOTH'];
const ClaimSubmissionMethod = ['ONLINE_PORTAL', 'EMAIL', 'MANUAL', 'API'];
const SupportedService = [
  'CONSULTATION',
  'LAB_TESTS',
  'PACKAGES',
  'DIAGNOSTICS',
  'HOME_CARE',
  'SURGERY',
  'EMERGENCY'
];

const createInsuranceProviderSchema = Joi.object({
  providerName: Joi.string().trim().min(2).max(100).required(),

  providerType: Joi.string()
    .valid(...ProviderType)
    .required(),

  contactEmail: Joi.string().email().lowercase().required(),

  contactPhone: Joi.string().trim().min(8).max(20).required(),

  website: Joi.string().uri().optional().allow(null, ''),

  networkType: Joi.string()
    .valid(...NetworkType)
    .required(),

  claimSubmissionMethod: Joi.string()
    .valid(...ClaimSubmissionMethod)
    .required(),

  avgProcessingDays: Joi.number().integer().min(0).max(365).optional().allow(null),

  address: Joi.string().trim().min(5).max(255).required(),

  supportedServices: Joi.array()
    .items(Joi.string().valid(...SupportedService))
    .min(1)
    .required(),

  note: Joi.string().max(500).optional().allow(null, '')
});

const updateInsuranceProviderSchema = createInsuranceProviderSchema
  .fork(Object.keys(createInsuranceProviderSchema.describe().keys), (schema) => schema.optional())
  .min(1);

module.exports = {
  createInsuranceProviderSchema,
  updateInsuranceProviderSchema
};
