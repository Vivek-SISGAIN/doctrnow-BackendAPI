const specialtyService = require('../service/specialty.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getAllSpecialties = asyncHandler(async (req, res) => {
  const specialties = await specialtyService.findAllWithDoctorCount();

  res.status(200).json({
    success: true,
    data: specialties
  });
});

const getSpecialtyById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const specialty = await specialtyService.findById(id);

  if (!specialty) {
    throw ApiError.notFound('Specialty not found');
  }

  res.status(200).json({
    success: true,
    data: specialty
  });
});

module.exports = {
  getAllSpecialties,
  getSpecialtyById
};
