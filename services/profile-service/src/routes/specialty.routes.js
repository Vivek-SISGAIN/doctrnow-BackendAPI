const express = require('express');
const router = express.Router();
const { getAllSpecialties, getSpecialtyById } = require('../controllers/specialty.controller');

/**
 * GET /api/specialties - List all specialties with doctor count
 */
router.get('/', getAllSpecialties);

/**
 * GET /api/specialties/:id - Get specialty by ID
 */
router.get('/:id', getSpecialtyById);

module.exports = router;
