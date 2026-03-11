const express = require('express');
const router = express.Router();
const { getUser} = require('../controllers/user.controller');

/**
 * GET /api/specialties - List all specialties with doctor count
 */
router.get('/', getUser);

module.exports = router;
