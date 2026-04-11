const express = require('express');
const router = express.Router();
const controller = require('../controllers/internalSearch.controller');
const { internalAuth } = require('../middleware/internalAuth');

// Apply internal HMAC protection
router.use(internalAuth);

router.get('/specialties', controller.searchSpecialties);
router.get('/doctors', controller.searchDoctors);

module.exports = router;
