const slotService = require('../service/slot.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getAvailableSlots = asyncHandler(async (req, res) => {
  const { doctorId, startDate, endDate } = req.query;

  if (!doctorId) {
    throw ApiError.badRequest('Doctor ID is required');
  }

  if (!startDate || !endDate) {
    throw ApiError.badRequest('Start date and end date are required');
  }

  const slots = await slotService.findAvailableSlots(
    doctorId,
    new Date(startDate),
    new Date(endDate)
  );

  res.status(200).json({
    success: true,
    data: slots
  });
});

const getSlotsByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { status, startDate, endDate } = req.query;

  const filters = {
    status,
    startDate,
    endDate
  };

  const slots = await slotService.findByDoctorId(doctorId, filters);

  res.status(200).json({
    success: true,
    data: slots
  });
});

const getSlotById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const slot = await slotService.findById(id);

  if (!slot) {
    throw ApiError.notFound('Slot not found');
  }

  res.status(200).json({
    success: true,
    data: slot
  });
});

const createSlot = asyncHandler(async (req, res) => {
  const slot = await slotService.create(req.body);

  res.status(201).json({
    success: true,
    message: 'Slot created successfully',
    data: slot
  });
});

const createBulkSlots = asyncHandler(async (req, res) => {
  const result = await slotService.createBulk(req.body);

  res.status(201).json({
    success: true,
    message: `${result.count} slots created/updated successfully`,
    data: {
      count: result.count
    }
  });
});

const updateSlot = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const slot = await slotService.findById(id);

  if (!slot) {
    throw ApiError.notFound('Slot not found');
  }

  const updatedSlot = await slotService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Slot updated successfully',
    data: updatedSlot
  });
});

const deleteSlot = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const slot = await slotService.findById(id);

  if (!slot) {
    throw ApiError.notFound('Slot not found');
  }

  await slotService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Slot deleted successfully'
  });
});

const lockSlot = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lockedBy, expiresInMinutes = 5 } = req.body;

  const lock = await slotService.lockSlot(id, lockedBy, expiresInMinutes);

  res.status(200).json({
    success: true,
    message: 'Slot locked successfully',
    data: lock
  });
});

const unlockSlot = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await slotService.unlockSlot(id);

  res.status(200).json({
    success: true,
    message: 'Slot unlocked successfully'
  });
});

const getNextAvailableSlotsBulk = asyncHandler(async (req, res) => {
  const { doctorIds } = req.body;

  if (!doctorIds || !Array.isArray(doctorIds)) {
    throw ApiError.badRequest('doctorIds must be an array');
  }

  const slotMap = await slotService.findNextAvailableSlotsBulk(doctorIds);

  res.status(200).json({
    success: true,
    data: slotMap
  });
});

const getDoctorsWithAvailableSlots = asyncHandler(async (req, res) => {
  const { startDate, endDate, doctorIds } = { ...req.query, ...req.body };

  const parsedDoctorIds = Array.isArray(doctorIds)
    ? doctorIds
    : (typeof doctorIds === 'string' && doctorIds.length > 0)
    ? doctorIds.split(',').map((id) => id.trim())
    : [];

  const availableDoctorIds = await slotService.findDoctorsWithAvailableSlots({
    startDate,
    endDate,
    doctorIds: parsedDoctorIds
  });

  res.status(200).json({
    success: true,
    data: availableDoctorIds
  });
});

module.exports = {
  getAvailableSlots,
  getSlotsByDoctor,
  getSlotById,
  createSlot,
  createBulkSlots,
  updateSlot,
  deleteSlot,
  lockSlot,
  unlockSlot,
  getNextAvailableSlotsBulk,
  getDoctorsWithAvailableSlots
};
