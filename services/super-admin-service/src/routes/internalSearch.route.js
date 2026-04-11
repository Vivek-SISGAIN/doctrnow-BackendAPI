import express from "express";
import { searchHospitalsController } from "../controllers/internalSearch.controller.js";
import { internalAuth } from "../middlewares/internalAuth.js";

const router = express.Router();

// Apply internal HMAC protection
router.use(internalAuth);

router.get("/hospitals", searchHospitalsController);

export default router;
