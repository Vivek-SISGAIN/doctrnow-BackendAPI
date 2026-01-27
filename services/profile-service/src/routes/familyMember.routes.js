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

/**
 * @swagger
 * /api/family-members/patient/{patientId}:
 *   get:
 *     summary: Get all family members by patient ID
 *     tags: [Family Members]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: List of family members
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FamilyMember'
 */
router.get('/patient/:patientId', getFamilyMembersByPatientId);

/**
 * @swagger
 * /api/family-members/{id}:
 *   get:
 *     summary: Get family member by ID
 *     tags: [Family Members]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Family member ID
 *     responses:
 *       200:
 *         description: Family member found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/FamilyMember'
 *       404:
 *         description: Family member not found
 */
router.get('/:id', getFamilyMemberById);

/**
 * @swagger
 * /api/family-members/{id}:
 *   patch:
 *     summary: Update family member by ID
 *     tags: [Family Members]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Family member ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               mobileNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               isEmergencyContact:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Family member updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/FamilyMember'
 *       404:
 *         description: Family member not found
 */
router.patch('/:id', validate(updateFamilyMemberSchema), updateFamilyMember);

/**
 * @swagger
 * /api/family-members/{id}:
 *   delete:
 *     summary: Delete family member by ID
 *     tags: [Family Members]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Family member ID
 *     responses:
 *       200:
 *         description: Family member deleted successfully
 *       404:
 *         description: Family member not found
 */
router.delete('/:id', deleteFamilyMember);

module.exports = router;
