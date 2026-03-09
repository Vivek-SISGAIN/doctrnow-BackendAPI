const hospitalAdminService = require('../service/hospitalAdmin.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getHospitalAdminById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hospitalAdmin = await hospitalAdminService.findById(id);

  if (!hospitalAdmin) {
    throw ApiError.notFound('Hospital admin not found');
  }

  res.status(200).json({
    success: true,
    data: hospitalAdmin
  });
});

const getHospitalAdminsByHospital = asyncHandler(async (req, res) => {
  const { hospitalName } = req.params;

  const hospitalAdmins = await hospitalAdminService.findByHospitalName(hospitalName);

  res.status(200).json({
    success: true,
    data: hospitalAdmins
  });
});

const updateHospitalAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hospitalAdmin = await hospitalAdminService.findById(id);

  if (!hospitalAdmin) {
    throw ApiError.notFound('Hospital admin not found');
  }

  const updatedHospitalAdmin = await hospitalAdminService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Hospital admin updated successfully',
    data: updatedHospitalAdmin
  });
});

const deleteHospitalAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const hospitalAdmin = await hospitalAdminService.findById(id);

  if (!hospitalAdmin) {
    throw ApiError.notFound('Hospital admin not found');
  }

  await hospitalAdminService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Hospital admin deleted successfully'
  });
});

module.exports = {
  getHospitalAdminById,
  getHospitalAdminsByHospital,
  updateHospitalAdmin,
  deleteHospitalAdmin
};
