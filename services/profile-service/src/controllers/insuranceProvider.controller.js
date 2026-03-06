const insuranceProviderService = require('../service/insuranceProvider.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getAllInsuranceProviders = asyncHandler(async (req, res) => {
  const providers = await insuranceProviderService.findAll(req.query);

  if (!providers || providers.length === 0) {
    throw ApiError.notFound('Insurance Providers not found');
  }

  res.status(200).json({
    success: true,
    data: providers
  });
});

const getInsuranceProviderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const provider = await insuranceProviderService.findById(id);

  if (!provider) {
    throw ApiError.notFound('Insurance Provider not found');
  }

  res.status(200).json({
    success: true,
    data: provider
  });
});

const createInsuranceProvider = asyncHandler(async (req, res) => {
  const {
    providerName,
    providerType,

    contactEmail,
    contactPhone,
    website,

    networkType,
    claimSubmissionMethod,

    avgProcessingDays,
    address,

    supportedServices,
    note
  } = req.body;

  const provider = await insuranceProviderService.create({
    providerName,
    providerType,

    contactEmail,
    contactPhone,
    website,

    networkType,
    claimSubmissionMethod,

    avgProcessingDays,
    address,

    supportedServices,
    note
  });

  res.status(201).json({
    success: true,
    message: 'Insurance Provider created successfully',
    data: provider
  });
});

const updateInsuranceProvider = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { providerName, contactEmail, contactPhone } = req.body;

  const provider = await insuranceProviderService.findById(id);

  if (!provider) {
    throw ApiError.notFound('Insurance Provider not found');
  }

  // Check for conflicts if updating unique fields
  const conflict = await insuranceProviderService.findConflictingProvider(id, {
    providerName,
    contactEmail,
    contactPhone
  });

  if (conflict) {
    if (conflict.providerName === providerName) {
      throw ApiError.conflict('Provider name already in use');
    }
    if (conflict.contactEmail === contactEmail) {
      throw ApiError.conflict('Email already in use');
    }
    if (conflict.contactPhone === contactPhone) {
      throw ApiError.conflict('Phone number already in use');
    }
  }

  const updatedProvider = await insuranceProviderService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Insurance Provider updated successfully',
    data: updatedProvider
  });
});

const deleteInsuranceProvider = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const provider = await insuranceProviderService.findById(id);

  if (!provider) {
    throw ApiError.notFound('Insurance Provider not found');
  }

  await insuranceProviderService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Insurance Provider deleted successfully'
  });
});

module.exports = {
  getAllInsuranceProviders,
  getInsuranceProviderById,
  createInsuranceProvider,
  updateInsuranceProvider,
  deleteInsuranceProvider
};
