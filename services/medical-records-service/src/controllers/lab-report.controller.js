const labReportService = require('../service/lab-report.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  try {
    const report = await labReportService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Lab report created successfully',
      data: report,
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const report = await labReportService.findById(id);
  if (!report) throw ApiError.notFound('Lab report not found');
  res.status(200).json({
    success: true,
    data: report,
  });
});

const getByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { status, page, limit } = req.query;
  const result = await labReportService.findByDoctorId(doctorId, { status, page, limit });
  res.status(200).json({
    success: true,
    data: result.reports,
    pagination: result.pagination,
  });
});

const getByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { status, limit } = req.query;
  const reports = await labReportService.findByPatientId(patientId, { status, limit });
  res.status(200).json({
    success: true,
    data: reports,
  });
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await labReportService.findById(id);
  if (!existing) throw ApiError.notFound('Lab report not found');
  try {
    const updated = await labReportService.update(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Lab report updated successfully',
      data: updated,
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await labReportService.findById(id);
  if (!existing) throw ApiError.notFound('Lab report not found');
  await labReportService.delete(id);
  return res.status(200).json({
    success: true,
    message: 'Lab report deleted successfully',
  });
});

module.exports = {
  create,
  getById,
  getByDoctor,
  getByPatient,
  update,
  remove,
};
