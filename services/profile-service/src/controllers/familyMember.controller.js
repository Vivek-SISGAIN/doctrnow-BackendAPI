const familyMemberService = require('../service/familyMember.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getFamilyMemberById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const familyMember = await familyMemberService.findById(id);

  if (!familyMember) {
    throw ApiError.notFound('Family member not found');
  }

  res.status(200).json({
    success: true,
    data: familyMember
  });
});

const getFamilyMembersByPatientId = asyncHandler(async (req, res) => {
  const { patientId } = req.params;

  const patient = await familyMemberService.findPatientById(patientId);

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  const familyMembers = await familyMemberService.findByPatientId(patientId);

  res.status(200).json({
    success: true,
    data: familyMembers
  });
});

const createFamilyMember = asyncHandler(async (req, res) => {
  const { patientId } = req.body;
  const patient = await familyMemberService.findPatientById(patientId);
  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }
  if (req.body.emiratesId) {
    const conflict = await familyMemberService.findByEmiratesId(req.body.emiratesId);
    if (conflict) {
      throw ApiError.conflict('Emirates ID already in use');
    }
  }
  const familyMember = await familyMemberService.create(req.body);
  res.status(201).json({
    success: true,
    message: 'Family member created successfully',
    data: familyMember
  });
});

const updateFamilyMember = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { emiratesId } = req.body;

  const familyMember = await familyMemberService.findById(id);

  if (!familyMember) {
    throw ApiError.notFound('Family member not found');
  }

  // Check for Emirates ID conflict if updating
  const conflict = await familyMemberService.findConflictingEmiratesId(id, emiratesId);

  if (conflict) {
    throw ApiError.conflict('Emirates ID already in use');
  }

  const updatedFamilyMember = await familyMemberService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Family member updated successfully',
    data: updatedFamilyMember
  });
});

const deleteFamilyMember = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const familyMember = await familyMemberService.findById(id);

  if (!familyMember) {
    throw ApiError.notFound('Family member not found');
  }

  await familyMemberService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Family member deleted successfully'
  });
});

module.exports = {
  getFamilyMemberById,
  getFamilyMembersByPatientId,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember
};
