const express = require('express');
const router = express.Router();
const {
  getFamilyMemberById,
  getFamilyMembersByPatientId,
  updateFamilyMember,
  deleteFamilyMember
} = require('../controllers/familyMember.controller');
const {  updateFamilyMemberSchema } = require('../validations/familyMember.validation');
const validate = require('../middleware/validation');

// Routes
router.get('/patient/:patientId', getFamilyMembersByPatientId);
router.get('/:id', getFamilyMemberById);
router.patch('/:id', validate(updateFamilyMemberSchema), updateFamilyMember);
router.delete('/:id', deleteFamilyMember);

module.exports = router;
