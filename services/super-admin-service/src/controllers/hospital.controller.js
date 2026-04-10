import hospitalService from "../services/hospital.service.js";
import asyncHandler from "../utils/asyncHandler.js";

class HospitalController {

  createHospital = asyncHandler(async (req, res) => {

    const hospital = await hospitalService.createHospital(req.body);

    res.status(201).json({
      success: true,
      message: "Hospital created successfully",
      data: hospital
    });

  });

  getHospitals = asyncHandler(async (req, res) => {
    const {
      search,
      location,
      specialties,       // "Cardiology,Neurology" or repeated ?specialties[]=…
      status,            // "ACTIVE,PENDING" or repeated ?status[]=…
      doctorMin,
      doctorMax,
      consultationMin,
      consultationMax,
      page  = 1,
      limit = 20,
    } = req.query;

    const filters = {
      search,
      location,
      specialties,
      status,
      doctorMin,
      doctorMax,
      consultationMin,
      consultationMax,
    };

    const result = await hospitalService.getHospitals(filters, { page, limit });

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
      data: hospital
    });

  });

  updateHospital = asyncHandler(async (req, res) => {

    const hospital = await hospitalService.updateHospital(
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "Hospital updated successfully",
      data: hospital
    });

  });

  deleteHospital = asyncHandler(async (req, res) => {

    const result = await hospitalService.deleteHospital(req.params.id);

    res.status(200).json({
      success: true,
      ...result
    });

  });

}

export default new HospitalController();
