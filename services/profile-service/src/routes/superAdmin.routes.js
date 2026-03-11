const express = require('express');
const router = express.Router();
const {
  getSuperAdminById,
  updateSuperAdmin,
  deleteSuperAdmin
} = require('../controllers/superAdmin.controller');
const { updateSuperAdminSchema } = require('../validations/superAdmin.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/super-admins/{id}:
 *   get:
 *     summary: Get super admin by ID
 *     tags: [Super Admins]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Super admin ID
 *     responses:
 *       200:
 *         description: Super admin found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SuperAdmin'
 *       404:
 *         description: Super admin not found
 */
router.get('/:id', getSuperAdminById);

/**
 * @swagger
 * /api/super-admins/{id}:
 *   patch:
 *     summary: Update super admin by ID
 *     tags: [Super Admins]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Super admin ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Super admin updated successfully
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
 *                   $ref: '#/components/schemas/SuperAdmin'
 *       404:
 *         description: Super admin not found
 */
router.patch('/:id', validate(updateSuperAdminSchema), updateSuperAdmin);

/**
 * @swagger
 * /api/super-admins/{id}:
 *   delete:
 *     summary: Delete super admin by ID
 *     tags: [Super Admins]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Super admin ID
 *     responses:
 *       200:
 *         description: Super admin deleted successfully
 *       404:
 *         description: Super admin not found
 */
router.delete('/:id', deleteSuperAdmin);


module.exports = router;
