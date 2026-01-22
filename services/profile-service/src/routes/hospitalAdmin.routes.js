const express = require('express');
const router = express.Router();
const {

  getHospitalAdminById,
  getHospitalAdminsByHospital,
  updateHospitalAdmin,
  deleteHospitalAdmin
} = require('../controllers/hospitalAdmin.controller');
const {  updateHospitalAdminSchema } = require('../validations/hospitalAdmin.validation');
const validate = require('../middleware/validation');

// Routes
router.get('/hospital/:hospitalName', getHospitalAdminsByHospital);
router.get('/:id', getHospitalAdminById);
router.patch('/:id', validate(updateHospitalAdminSchema), updateHospitalAdmin);
router.delete('/:id', deleteHospitalAdmin);

module.exports = router;
