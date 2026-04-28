import multer from 'multer';

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const fileFilter = (_req: any, file: any, cb: any) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WEBP, PDF`),
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

export const profileImageUpload = upload.single('profileImage');

// Used by doctor creation to accept profileImage + credential documents in one request.
export const createDoctorUpload = upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'medicalLicense', maxCount: 1 },
  { name: 'emiratesId', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  { name: 'professionalPhoto', maxCount: 1 },
  { name: 'medicalDegree', maxCount: 1 },
  { name: 'specialistCert', maxCount: 1 },
  { name: 'cvResume', maxCount: 1 },
  { name: 'goodStanding', maxCount: 1 },
]);

export const doctorDocumentsUpload = upload.fields([
  { name: 'medicalLicense', maxCount: 1 },
  { name: 'emiratesId', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  { name: 'professionalPhoto', maxCount: 1 },
  { name: 'medicalDegree', maxCount: 1 },
  { name: 'specialistCert', maxCount: 1 },
  { name: 'cvResume', maxCount: 1 },
  { name: 'goodStanding', maxCount: 1 },
]);

export default upload;
