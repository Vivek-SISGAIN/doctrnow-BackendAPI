const express = require('express');
const router = express.Router();
const {
  getPatientById,
  updatePatient,
  deletePatient
} = require('../controllers/patient.controller');
const { updatePatientSchema } = require('../validations/patient.validation');
const validate = require('../middleware/validation');
// Routes
router.get('/:id', getPatientById);
router.patch('/:id', validate(updatePatientSchema), updatePatient);
router.delete('/:id', deletePatient);

module.exports = router;
