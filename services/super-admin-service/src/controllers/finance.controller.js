import financeService from "../services/finance.service.js";
import asyncHandler from "../utils/asyncHandler.js";

class FinanceController {
  createFinance = asyncHandler(async (req, res) => {
    const finance = await financeService.createFinance(req.body);
    res.status(201).json({
      success: true,
      message: "Finance created successfully",
      data: finance
    });
  });

  getFinances = asyncHandler(async (req, res) => {
    const finances = await financeService.getFinances();
    res.status(200).json({
      success: true,
      count: finances.length,
      data: finances
    });
  });

  getFinanceById = asyncHandler(async (req, res) => {
    const finance = await financeService.getFinanceById(req.params.id);
    res.status(200).json({
      success: true,
      data: finance
    });
  });

  getFinanceByHospitalId = asyncHandler(async (req, res) => {
    const finance = await financeService.getFinanceByHospitalId(req.params.hospitalId);
    res.status(200).json({
      success: true,
      data: finance
    });
  });

  updateFinance = asyncHandler(async (req, res) => {
    const finance = await financeService.updateFinance(req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: "Finance updated successfully",
      data: finance
    });
  });

  deleteFinance = asyncHandler(async (req, res) => {
    const result = await financeService.deleteFinance(req.params.id);
    res.status(200).json({
      success: true,
      ...result
    });
  });
}

export default new FinanceController();
