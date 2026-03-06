const express = require('express');
const router = express.Router();
const {
  create,
  getById,
  getByDoctor,
  getByPatient,
  update,
  remove,
} = require('../controllers/lab-report.controller');
const { createLabReportSchema, updateLabReportSchema } = require('../validations/lab-report.validation');
const validate = require('../middleware/validation');

router.post('/', validate(createLabReportSchema), create);
router.get('/doctor/:doctorId', getByDoctor);
router.get('/patient/:patientId', getByPatient);
router.get('/:id', getById);
router.put('/:id', validate(updateLabReportSchema), update);
router.delete('/:id', remove);

module.exports = router;
