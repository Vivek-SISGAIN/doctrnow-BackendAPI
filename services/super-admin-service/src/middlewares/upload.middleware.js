import multer from "multer";

// Store files in memory so we can stream them directly to S3
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Allowed: PDF, JPEG, PNG, WEBP`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
  },
});

/**
 * Accepts exactly the five document fields expected by the hospital-documents API.
 * Each field allows up to 5 files (insurance/accreditation may be multi-doc).
 */
export const hospitalDocumentsUpload = upload.fields([
  { name: "tradeLicenseDocument",      maxCount: 1 },
  { name: "dhaLicenseDocument",        maxCount: 1 },
  { name: "insuranceDocuments",        maxCount: 5 },
  { name: "establishmentCard",         maxCount: 1 },
  { name: "accreditationCertificates", maxCount: 5 },
]);

/**
 * Accepts logo and promotional banner image files for hospital branding.
 */
export const hospitalBrandingUpload = upload.fields([
  { name: "logo",   maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);

export default upload;
