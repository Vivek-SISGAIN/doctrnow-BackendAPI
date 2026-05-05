import { Router } from "express";
import hospitalController from "../controllers/hospital.controller.js";
import financeController from "../controllers/finance.controller.js";
import bannerController from "../controllers/banner.controller.js";
import { hospitalDocumentsUpload, hospitalBrandingUpload } from "../middlewares/upload.middleware.js";

const router = Router();

router.post("/hospital", hospitalController.createHospital);
router.post("/hospital/bulk", hospitalController.getHospitalsBulk);
router.get("/hospital", hospitalController.getHospitals);
router.get("/hospital/search/ids", hospitalController.getHospitalIds);
router.get("/hospital/:id", hospitalController.getHospitalById);
router.patch("/hospital/:id", hospitalController.updateHospital);
router.delete("/hospital/:id", hospitalController.deleteHospital);

// ── Document Upload ──────────────────────────────────────────────────────────
// POST /hospital/:id/documents
// Content-Type: multipart/form-data
// Fields (all optional, send whichever documents you have):
//   tradeLicenseDocument      – PDF/image (1 file)
//   dhaLicenseDocument        – PDF/image (1 file)
//   insuranceDocuments        – PDF/image (up to 5 files)
//   establishmentCard         – PDF/image (1 file)
//   accreditationCertificates – PDF/image (up to 5 files)
router.post(
  "/hospital/:id/documents",
  hospitalDocumentsUpload,
  hospitalController.uploadDocuments
);

// ── Branding Upload ──────────────────────────────────────────────────────────
// POST /hospital/:id/branding
// Content-Type: multipart/form-data
// Fields (all optional):
//   logo           – PNG/JPG image (1 file)
//   banner         – PNG/JPG image (1 file)
//   primaryColor   – text "#RRGGBB"
//   secondaryColor – text "#RRGGBB"
router.post(
  "/hospital/:id/branding",
  hospitalBrandingUpload,
  hospitalController.uploadBranding
);

router.post("/finance", financeController.createFinance);
router.get("/finance", financeController.getFinances);
router.get("/finance/:id", financeController.getFinanceById);
router.get(
  "/finance/hospital/:hospitalId",
  financeController.getFinanceByHospitalId,
);
router.put("/finance/:id", financeController.updateFinance);
router.delete("/finance/:id", financeController.deleteFinance);

router.post("/banner", bannerController.createBanner);
router.get("/banner", bannerController.getBanners);
router.get("/banner/:id", bannerController.getBannerById);
router.put("/banner/:id", bannerController.updateBanner);
router.delete("/banner/:id", bannerController.deleteBanner);

export default router;
