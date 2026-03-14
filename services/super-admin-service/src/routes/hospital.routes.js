import { Router } from "express";
import hospitalController from "../controllers/hospital.controller.js";
import financeController from "../controllers/finance.controller.js";

const router = Router();

router.post("/hospital", hospitalController.createHospital);
router.get("/hospital", hospitalController.getHospitals);
router.get("/hospital/:id", hospitalController.getHospitalById);
router.put("/hospital/:id", hospitalController.updateHospital);
router.delete("/hospital/:id", hospitalController.deleteHospital);

// Finance routes
router.post("/finance", financeController.createFinance);
router.get("/finance", financeController.getFinances);
router.get("/finance/:id", financeController.getFinanceById);
router.get("/finance/hospital/:hospitalId", financeController.getFinanceByHospitalId);
router.put("/finance/:id", financeController.updateFinance);
router.delete("/finance/:id", financeController.deleteFinance);

export default router;