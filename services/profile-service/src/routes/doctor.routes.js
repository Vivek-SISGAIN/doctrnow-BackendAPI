const express = require('express');
const router = express.Router();
const {
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  searchDoctorsBySpecialization
} = require('../controllers/doctor.controller');
const { updateDoctorSchema } = require('../validations/doctor.validation');
const validate = require('../middleware/validation');

// Routes
router.get('/search/specialization', searchDoctorsBySpecialization);
router.get('/:id', getDoctorById);
router.patch('/:id', validate(updateDoctorSchema), updateDoctor);
router.delete('/:id', deleteDoctor);

module.exports = router;
