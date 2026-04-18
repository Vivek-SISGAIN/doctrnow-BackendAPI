const patientHealthService = require('../service/patientHealth.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Get current patient's health profile (GET /patients/me/health)
 */
const getCurrentHealthProfile = asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    throw ApiError.unauthorized('User ID required');
  }

  const healthProfile = await patientHealthService.findByUserId(userId);
  
  res.status(200).json({
    success: true,
    data: healthProfile || {} // Return empty object if none found yet
  });
});

/**
 * Create or update current patient's health profile (POST /patients/me/health)
 */
const upsertCurrentHealthProfile = asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    throw ApiError.unauthorized('User ID required');
  }

  const healthProfile = await patientHealthService.upsertByUserId(userId, req.body);
  
  res.status(200).json({
    success: true,
    message: 'Health profile updated successfully',
    data: healthProfile
  });
});

/**
 * Get health profile by patientId (internal/admin use)
 */
const getHealthProfileByPatientId = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const healthProfile = await patientHealthService.findByPatientId(patientId);
  
  if (!healthProfile) {
    throw ApiError.notFound('Health profile not found');
  }

  res.status(200).json({
    success: true,
    data: healthProfile
  });
});

module.exports = {
  getCurrentHealthProfile,
  upsertCurrentHealthProfile,
  getHealthProfileByPatientId
};
