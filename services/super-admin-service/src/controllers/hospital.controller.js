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

    const hospitals = await hospitalService.getHospitals();

    res.status(200).json({
      success: true,
      count: hospitals.length,
      data: hospitals
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
