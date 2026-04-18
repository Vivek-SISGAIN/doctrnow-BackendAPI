const express = require('express');
const patientHealthController = require('../controllers/patientHealth.controller');

const router = express.Router();

/**
 * @route   GET /api/v1/profile/patients/me/health
 * @desc    Get current patient's health profile
 * @access  Private (Patient)
 */
router.get('/me/health', patientHealthController.getCurrentHealthProfile);

/**
 * @route   POST /api/v1/profile/patients/me/health
 * @desc    Upsert current patient's health profile
 * @access  Private (Patient)
 */
router.post('/me/health', patientHealthController.upsertCurrentHealthProfile);

/**
 * @route   GET /api/v1/profile/patients/:patientId/health
 * @desc    Get health profile by patientId (Internal/Admin)
 * @access  Private (Staff)
 */
router.get('/:patientId/health', patientHealthController.getHealthProfileByPatientId);

module.exports = router;
