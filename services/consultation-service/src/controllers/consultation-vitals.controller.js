const vitalsService = require('../service/consultation-vitals.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const upsertVitals = asyncHandler(async (req, res) => {
  try {
    const vitals = await vitalsService.upsert(req.body.consultationId, req.body);
    res.status(200).json({
      success: true,
      message: 'Vitals saved successfully',
      data: vitals
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getVitalsByConsultation = asyncHandler(async (req, res) => {
  const { consultationId } = req.params;
  const vitals = await vitalsService.findByConsultationId(consultationId);

  if (!vitals) {
    throw ApiError.notFound('Vitals not found');
  }

  res.status(200).json({
    success: true,
    data: vitals
  });
});

const deleteVitals = asyncHandler(async (req, res) => {
  const { consultationId } = req.params;

  try {
    await vitalsService.delete(consultationId);
    res.status(200).json({
      success: true,
      message: 'Vitals deleted successfully'
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

module.exports = {
  upsertVitals,
  getVitalsByConsultation,
  deleteVitals
};
