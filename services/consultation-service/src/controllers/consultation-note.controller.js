const noteService = require('../service/consultation-note.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const createNote = asyncHandler(async (req, res) => {
  try {
    const note = await noteService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Note created successfully',
      data: note
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getNoteById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const note = await noteService.findById(id);

  if (!note) {
    throw ApiError.notFound('Note not found');
  }

  res.status(200).json({
    success: true,
    data: note
  });
});

const getNotesByConsultation = asyncHandler(async (req, res) => {
  const { consultationId } = req.params;
  const notes = await noteService.findByConsultationId(consultationId);

  res.status(200).json({
    success: true,
    data: notes
  });
});

const updateNote = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const note = await noteService.findById(id);
  if (!note) {
    throw ApiError.notFound('Note not found');
  }

  try {
    const updated = await noteService.update(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Note updated successfully',
      data: updated
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const deleteNote = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const note = await noteService.findById(id);
  if (!note) {
    throw ApiError.notFound('Note not found');
  }

  try {
    await noteService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const saveOrUpdateNote = asyncHandler(async (req, res) => {
  const { consultationId, content, createdBy } = req.body;

  try {
    const note = await noteService.saveOrUpdate(consultationId, content, createdBy);
    res.status(200).json({
      success: true,
      message: 'Note saved successfully',
      data: note
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

module.exports = {
  createNote,
  getNoteById,
  getNotesByConsultation,
  updateNote,
  deleteNote,
  saveOrUpdateNote
};
