const express = require('express');
const router = express.Router();
const {
  createNote,
  getNoteById,
  getNotesByConsultation,
  updateNote,
  deleteNote,
  saveOrUpdateNote
} = require('../controllers/consultation-note.controller');
const {
  createNoteSchema,
  updateNoteSchema
} = require('../validations/consultation.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/consultation-notes:
 *   post:
 *     summary: Create a consultation note
 *     tags: [Consultation Notes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consultationId
 *               - content
 *               - createdBy
 *             properties:
 *               consultationId:
 *                 type: string
 *                 format: uuid
 *               content:
 *                 type: string
 *               createdBy:
 *                 type: string
 *     responses:
 *       201:
 *         description: Note created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createNoteSchema), createNote);

/**
 * @swagger
 * /api/consultation-notes/save:
 *   post:
 *     summary: Save or update note (auto-save)
 *     tags: [Consultation Notes]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               consultationId:
 *                 type: string
 *                 format: uuid
 *               content:
 *                 type: string
 *               createdBy:
 *                 type: string
 *               noteId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Note saved or updated
 */
router.post('/save', saveOrUpdateNote);

/**
 * @swagger
 * /api/consultation-notes/consultation/{consultationId}:
 *   get:
 *     summary: Get all notes for a consultation
 *     tags: [Consultation Notes]
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of notes
 */
router.get('/consultation/:consultationId', getNotesByConsultation);

/**
 * @swagger
 * /api/consultation-notes/{id}:
 *   get:
 *     summary: Get note by ID
 *     tags: [Consultation Notes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Note found
 *       404:
 *         description: Note not found
 */
router.get('/:id', getNoteById);

/**
 * @swagger
 * /api/consultation-notes/{id}:
 *   put:
 *     summary: Update a note
 *     tags: [Consultation Notes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Note updated
 *       404:
 *         description: Note not found
 */
router.put('/:id', validate(updateNoteSchema), updateNote);

/**
 * @swagger
 * /api/consultation-notes/{id}:
 *   delete:
 *     summary: Delete a note
 *     tags: [Consultation Notes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Note deleted
 *       404:
 *         description: Note not found
 */
router.delete('/:id', deleteNote);

module.exports = router;
