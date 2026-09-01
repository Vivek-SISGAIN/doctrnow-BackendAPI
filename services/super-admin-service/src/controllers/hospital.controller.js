import hospitalService from "../services/hospital.service.js";
import asyncHandler from "../utils/asyncHandler.js";

const extractUserContext = (req) => ({
  userId: req.headers["x-user-id"] || req.user?.id || req.user?.userId || "admin",
  role: req.headers["x-user-role"] || req.user?.role || "SUPER_ADMIN",
});

class HospitalController {
  createHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const hospital = await hospitalService.createHospital(req.body, userContext);

    res.status(201).json({
      success: true,
      message: "Hospital created successfully",
      data: hospital,
    });
  });

  getHospitals = asyncHandler(async (req, res) => {
    const {
      search,
      location,
      emirate,
      emirates,
      area,
      hospitalType,
      type,
      hospitalTypes,
      specializationFocus,
      specialties,
      specialization,
      specializations,
      specializationsAvailable,
      services,
      servicesOffered,
      service,
      status,
      state,
      statuses,
      isBranch,
      parentHospitalId,
      branchId,
      operations,
      is24x7,
      include24x7,
      doctorMin,
      doctorMax,
      consultationMin,
      consultationMax,
      startDate,
      endDate,
      fromDate,
      toDate,
      from,
      to,
      dateFrom,
      dateTo,
      dateField,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      order,
      filters: dynamicFilters,
    } = { ...req.query, ...req.body };

    let filters = {};

    if (dynamicFilters) {
      try {
        filters =
          typeof dynamicFilters === "string"
            ? JSON.parse(dynamicFilters)
            : dynamicFilters;
      } catch {
        throw new Error("Invalid filters format");
      }
    } else {
      filters = {
        search,
        location,
        emirate: emirate || emirates,
        area,
        hospitalType: hospitalType || type || hospitalTypes,
        specializationFocus,
        specialties:
          specialties ||
          specialization ||
          specializations ||
          specializationsAvailable,
        services: services || servicesOffered || service,
        status: status || state || statuses,
        isBranch,
        parentHospitalId,
        branchId,
        operations,
        is24x7:
          is24x7 !== undefined
            ? is24x7
            : operations &&
              ["24x7", "24/7"].includes(String(operations).trim().toLowerCase())
            ? true
            : undefined,
        include24x7,
        doctorMin,
        doctorMax,
        consultationMin,
        consultationMax,
        startDate: startDate || fromDate || from || dateFrom,
        endDate: endDate || toDate || to || dateTo,
        dateField,
      };
    }

    const pagination = {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      sortBy: sortBy || "createdAt",
      sortOrder: sortOrder || order || "desc",
    };

    const result = await hospitalService.getHospitals(filters, pagination);

    res.status(200).json({
      success: true,
      count: result.hospitals.length,
      data: result.hospitals,
      pagination: result.pagination,
    });
  });

  getHospitalById = asyncHandler(async (req, res) => {
    const hospital = await hospitalService.getHospitalById(req.params.id);

    res.status(200).json({
      success: true,
      data: hospital,
    });
  });

  getHospitalsBulk = asyncHandler(async (req, res) => {
    const { ids } = req.body;
    const hospitalMap = await hospitalService.getHospitalByIds(ids);

    res.status(200).json({
      success: true,
      data: hospitalMap,
    });
  });

  updateHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const hospital = await hospitalService.updateHospital(
      req.params.id,
      req.body,
      userContext,
    );

    res.status(200).json({
      success: true,
      message: "Hospital updated successfully",
      data: hospital,
    });
  });

  deleteHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const result = await hospitalService.deleteHospital(req.params.id, userContext);

    res.status(200).json({
      success: true,
      ...result,
    });
  });

  // ─── Lifecycle Workflow Handlers ──────────────────────────────────────────

  submitForApproval = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks } = req.body || {};
    const hospital = await hospitalService.submitForApproval(req.params.id, {
      userContext,
      remarks,
    });

    res.status(200).json({
      success: true,
      message: "Hospital submitted for approval successfully",
      data: hospital,
    });
  });

  approveHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks } = req.body || {};
    const hospital = await hospitalService.approveHospital(req.params.id, {
      userContext,
      remarks,
    });

    res.status(200).json({
      success: true,
      message: "Hospital approved successfully",
      data: hospital,
    });
  });

  rejectHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks } = req.body || {};
    const hospital = await hospitalService.rejectHospital(req.params.id, {
      userContext,
      remarks,
    });

    res.status(200).json({
      success: true,
      message: "Hospital rejected successfully",
      data: hospital,
    });
  });

  sendBackHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks } = req.body || {};
    const hospital = await hospitalService.sendBackHospital(req.params.id, {
      userContext,
      remarks,
    });

    res.status(200).json({
      success: true,
      message: "Hospital sent back for correction successfully",
      data: hospital,
    });
  });

  resubmitHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks } = req.body || {};
    const hospital = await hospitalService.resubmitHospital(req.params.id, {
      userContext,
      remarks,
    });

    res.status(200).json({
      success: true,
      message: "Hospital resubmitted successfully",
      data: hospital,
    });
  });

  activateHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks } = req.body || {};
    const hospital = await hospitalService.activateHospital(req.params.id, {
      userContext,
      remarks,
    });

    res.status(200).json({
      success: true,
      message: "Hospital activated successfully",
      data: hospital,
    });
  });

  deactivateHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks } = req.body || {};
    const hospital = await hospitalService.deactivateHospital(req.params.id, {
      userContext,
      remarks,
    });

    res.status(200).json({
      success: true,
      message: "Hospital deactivated successfully",
      data: hospital,
    });
  });

  adminOverrideHospital = asyncHandler(async (req, res) => {
    const userContext = extractUserContext(req);
    const { remarks, ...payload } = req.body || {};
    const hospital = await hospitalService.adminOverrideHospital(req.params.id, {
      userContext,
      remarks,
      payload,
    });

    res.status(200).json({
      success: true,
      message: "Hospital admin override executed successfully",
      data: hospital,
    });
  });

  // ── Document & Branding Uploads ──────────────────────────────────────────

  uploadDocuments = asyncHandler(async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files were uploaded. Please attach at least one document.",
      });
    }

    const hospital = await hospitalService.uploadDocuments(
      req.params.id,
      req.files,
    );

    res.status(200).json({
      success: true,
      message: "Documents uploaded and saved successfully.",
      data: hospital,
    });
  });

  uploadBranding = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { primaryColor, secondaryColor } = req.body;
    const files = req.files || {};

    const hospital = await hospitalService.uploadBranding(
      id,
      files,
      primaryColor,
      secondaryColor,
    );

    res.status(200).json({
      success: true,
      message: "Branding updated successfully.",
      data: hospital,
    });
  });

  getHospitalIds = asyncHandler(async (req, res) => {
    const hospitals = await hospitalService.getHospitalIds(req.query);

    res.status(200).json({
      success: true,
      data: hospitals,
    });
  });
}

export default new HospitalController();
