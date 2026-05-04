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
  const { hospitalName, hospitalId } = req.params;
  const hospitalAdmins = hospitalId
    ? await hospitalAdminService.findByHospitalId(hospitalId)
    : await hospitalAdminService.findByHospitalName(hospitalName);

  res.status(200).json({
    success: true,
    data: hospitalAdmins
  });
});

const createHospitalAdmin = asyncHandler(async (req, res) => {
  const {
    userId,
    fullName,
    email,
    phoneNumber,
    gender,
    nationality,
    emiratesId,
    hospitalName,
    profileImage,
    hospitalId,
    position,
    department,
    tenantId,
    subRole
  } = req.body;

  const hospitalAdmin = await hospitalAdminService.createHospitalAdmin({
    userId,
    fullName,
    email,
    phoneNumber,
    gender,
    nationality,
    emiratesId,
    hospitalName,
    profileImage,
    hospitalId,
    position,
    department,
    tenantId,
    subRole
  });

  res.status(201).json({
    success: true,
    message: 'Hospital admin created successfully',
    data: hospitalAdmin
  });
});

const getAllHospitalAdmins = asyncHandler(async (req, res) => {
  const { search, gender, page = 1, limit = 20 } = req.query;

  // Build filters
  const filters = {
    search,
    gender
  };

  // Pagination setup
  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10)
  };

  // Call service
  const result = await hospitalAdminService.findAll(filters, pagination);

  res.status(200).json({
    success: true,
    data: result.data,
    pagination: result.pagination
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
  deleteHospitalAdmin,
  createHospitalAdmin,
  getAllHospitalAdmins
};
