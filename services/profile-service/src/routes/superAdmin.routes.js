const express = require('express');
const router = express.Router();
const {
  getSuperAdminById,
  updateSuperAdmin,
  deleteSuperAdmin
} = require('../controllers/superAdmin.controller');
const { updateSuperAdminSchema } = require('../validations/superAdmin.validation');
const validate = require('../middleware/validation');

// Routes
router.get('/:id', getSuperAdminById);
router.patch('/:id', validate(updateSuperAdminSchema), updateSuperAdmin);
router.delete('/:id', deleteSuperAdmin);

module.exports = router;
