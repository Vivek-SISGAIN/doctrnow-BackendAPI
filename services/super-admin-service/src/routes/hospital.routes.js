import { Router } from "express";
import hospitalController from "../controllers/hospital.controller.js";
import financeController from "../controllers/finance.controller.js";

const router = Router();

router.post("/", hospitalController.createHospital);
router.get("/", hospitalController.getHospitals);
router.get("/:id", hospitalController.getHospitalById);
router.put("/:id", hospitalController.updateHospital);
router.delete("/:id", hospitalController.deleteHospital);

// Finance routes
router.post("/finance", financeController.createFinance);
router.get("/finance", financeController.getFinances);
router.get("/finance/:id", financeController.getFinanceById);
router.get("/finance/hospital/:hospitalId", financeController.getFinanceByHospitalId);
router.put("/finance/:id", financeController.updateFinance);
router.delete("/finance/:id", financeController.deleteFinance);

export default router;