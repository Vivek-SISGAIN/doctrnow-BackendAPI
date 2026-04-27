const documentService = require('../service/document.service');
const s3Service = require('../service/s3.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// ─── Internal Secret Middleware ───────────────────────────────────────────────
// Used to protect bulk endpoints called only by appointment/consultation services.
const requireInternalSecret = (req, res, next) => {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers['x-internal-secret'];
  if (!secret || !provided || provided !== secret) {
    return res.status(401).json({ success: false, message: 'Unauthorized: missing or invalid internal secret' });
  }
  next();
};

// ─── Existing Endpoints ───────────────────────────────────────────────────────

const createDocument = asyncHandler(async (req, res) => {
  try {
    const document = await documentService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await documentService.findById(id);

  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  res.status(200).json({
    success: true,
    data: document
  });
});

const getDocumentsByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { type, page, limit, search, startDate, endDate } = req.query;

  const result = await documentService.findByPatientId(patientId, {
    type,
    page,
    limit,
    search,
    startDate,
    endDate
  });

  res.status(200).json({
    success: true,
    data: result.documents,
    pagination: result.pagination
  });
});

const getDocumentsByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { type, page, limit, search, startDate, endDate } = req.query;

  const result = await documentService.findByDoctorId(doctorId, {
    type,
    page,
    limit,
    search,
    startDate,
    endDate
  });

  res.status(200).json({
    success: true,
    data: result.documents,
    pagination: result.pagination
  });
});

const getDocumentsByAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const documents = await documentService.findByAppointmentId(appointmentId);

  res.status(200).json({
    success: true,
    data: documents
  });
});

const getDocumentsByConsultation = asyncHandler(async (req, res) => {
  const { consultationId } = req.params;
  const documents = await documentService.findByConsultationId(consultationId);

  res.status(200).json({
    success: true,
    data: documents
  });
});

const updateDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const document = await documentService.findById(id);
  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  try {
    const updated = await documentService.update(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: updated
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const document = await documentService.findById(id);
  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  try {
    // Also remove from S3 if a key is stored
    if (document.filePath && document.filePath.startsWith('documents/')) {
      await s3Service.deleteObject(document.filePath).catch((err) => {
        console.warn(`[DocumentController] Could not delete S3 object ${document.filePath}:`, err.message);
      });
    }
    await documentService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

/**
 * GET /api/documents/:id/url
 * Returns a presigned GET URL for downloading/viewing a specific document.
 */
const getDocumentUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await documentService.findById(id);
  if (!document) {
    throw ApiError.notFound('Document not found');
  }
  
  if (!document.filePath) {
    throw ApiError.badRequest('Document does not have a linked S3 file');
  }

  const url = await s3Service.getDocumentPresignedUrl(document.filePath);
  
  res.status(200).json({
    success: true,
    data: { url }
  });
});

// ─── New Endpoints ────────────────────────────────────────────────────────────

/**
 * GET /api/documents/upload-url
 * Returns a presigned PUT URL for direct S3 upload + the temp s3Key.
 * Query params: patientId, fileName, mimeType, fileSize (bytes)
 */
const getUploadUrl = asyncHandler(async (req, res) => {
  const { patientId, fileName, mimeType, fileSize } = req.query;

  if (!patientId || !fileName || !mimeType) {
    throw ApiError.badRequest('patientId, fileName, and mimeType are required');
  }

  // Enforce file size limit
  const maxBytes = s3Service.maxFileSizeBytes;
  if (fileSize && parseInt(fileSize, 10) > maxBytes) {
    throw ApiError.badRequest(`File size exceeds the maximum allowed size of ${s3Service.maxFileSizeMb}MB`);
  }

  const { uploadUrl, s3Key } = await s3Service.getUploadPresignedUrl(patientId, fileName, mimeType);

  res.status(200).json({
    success: true,
    data: { uploadUrl, s3Key, maxFileSizeMb: s3Service.maxFileSizeMb }
  });
});

/**
 * DELETE /api/documents/temp-file
 * Deletes a temp S3 object when user discards a staged upload.
 * Body: { s3Key }
 */
const deleteTempFile = asyncHandler(async (req, res) => {
  const { s3Key } = req.body;

  if (!s3Key) {
    throw ApiError.badRequest('s3Key is required');
  }

  // Only allow deleting keys in the temp/ prefix
  if (!s3Key.startsWith('temp/')) {
    throw ApiError.badRequest('Only temp/ keys can be deleted via this endpoint');
  }

  await s3Service.deleteObject(s3Key);

  res.status(200).json({
    success: true,
    message: 'Temp file deleted successfully'
  });
});

/**
 * POST /api/documents/confirm-upload
 * Moves file from temp/ to documents/, saves metadata in DB.
 * Body: { patientId, doctorId, appointmentId, consultationId, name, type, s3Key, fileSize, mimeType, uploadedBy, description }
 */
const confirmUpload = asyncHandler(async (req, res) => {
  const { patientId, s3Key, name, type, fileSize, mimeType, uploadedBy } = req.body;

  if (!patientId || !s3Key || !name || !type || !uploadedBy) {
    throw ApiError.badRequest('patientId, s3Key, name, type, and uploadedBy are required');
  }

  if (!s3Key.startsWith('temp/')) {
    throw ApiError.badRequest('s3Key must point to a temp/ object');
  }

  const destKey = s3Key.replace(/^temp\//, 'documents/');
  const finalKey = await s3Service.moveObject(s3Key, destKey);

  const document = await documentService.create({
    patientId,
    doctorId: req.body.doctorId || undefined,
    appointmentId: req.body.appointmentId || undefined,
    consultationId: req.body.consultationId || undefined,
    name,
    type,
    filePath: finalKey,
    fileSize: fileSize ? parseInt(fileSize, 10) : 0,
    mimeType,
    uploadedBy,
    description: req.body.description || undefined,
  });

  if (req.body.appointmentId) {
    await _notifyConsultation(req.body.appointmentId, patientId, document.id, req.body.consultationId);
  }

  res.status(201).json({
    success: true,
    message: 'Document confirmed and saved successfully',
    data: document
  });
});

/**
 * POST /api/documents/confirm-upload-bulk
 * Confirms multiple staged uploads in one request.
 * Body: { documents: Array<{ patientId, doctorId, appointmentId, consultationId, name, type, s3Key, fileSize, mimeType, uploadedBy, description }> }
 */
const confirmUploadBulk = asyncHandler(async (req, res) => {
  const { documents } = req.body;

  if (!Array.isArray(documents) || documents.length === 0) {
    throw ApiError.badRequest('documents must be a non-empty array');
  }

  const results = [];
  
  // Process all in parallel for speed
  await Promise.all(documents.map(async (doc) => {
    const { patientId, s3Key, name, type, uploadedBy } = doc;
    if (!patientId || !s3Key || !name || !type || !uploadedBy) return;
    if (!s3Key.startsWith('temp/')) return;

    try {
      const destKey = s3Key.replace(/^temp\//, 'documents/');
      const finalKey = await s3Service.moveObject(s3Key, destKey);

      const saved = await documentService.create({
        ...doc,
        filePath: finalKey,
        fileSize: doc.fileSize ? parseInt(doc.fileSize, 10) : 0,
      });

      results.push(saved);

      if (doc.appointmentId) {
        _notifyConsultation(doc.appointmentId, patientId, saved.id, doc.consultationId).catch(() => {});
      }
    } catch (err) {
      console.error(`[DocumentController] Bulk confirm failed for ${name}:`, err.message);
    }
  }));

  res.status(201).json({
    success: true,
    message: `${results.length} documents confirmed successfully`,
    data: results
  });
});

// Helper for socket notifications
async function _notifyConsultation(appointmentId, patientId, documentId, consultationId) {
  const consultationBaseUrl = process.env.API_GATEWAY_URL || process.env.BASE_URL || 'http://localhost:8080/api/v1';
  const internalSecret = process.env.INTERNAL_SECRET || '';
  const notifyUrl = `${consultationBaseUrl.endsWith('/') ? consultationBaseUrl : consultationBaseUrl + '/'}consultations/notify/document-uploaded`;
  
  try {
    await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ consultationId, patientId, documentId, appointmentId }),
    });
  } catch (err) {
    console.warn(`[DocumentController] Notify failed: ${err.message}`);
  }
}


// ─── Internal Bulk Endpoints (x-internal-secret protected) ───────────────────

/**
 * POST /api/documents/appointments/bulk
 * Returns a map of { appointmentId: Document[] } for multiple appointment IDs.
 * Internal-only — protected by x-internal-secret header.
 */
const getDocumentsByAppointmentsBulk = [
  requireInternalSecret,
  asyncHandler(async (req, res) => {
    const { ids, mappings } = req.body; // mappings = { appointmentId: consultationId }
    if (!Array.isArray(ids) || ids.length === 0) {
      throw ApiError.badRequest('ids must be a non-empty array of appointment IDs');
    }

    const consultationIds = mappings ? Object.values(mappings).filter((id) => id) : [];
    const apptToConsult = mappings || {};
    
    // Invert mapping for easier lookup: consultationId -> appointmentId
    const consultToAppt = {};
    if (mappings) {
      Object.entries(mappings).forEach(([apptId, consultId]) => {
        if (consultId) consultToAppt[consultId] = apptId;
      });
    }

    const prisma = require('../prisma/prisma');
    const docs = await prisma.medicalDocument.findMany({
      where: {
        OR: [
          { appointmentId: { in: ids } },
          { consultationId: { in: consultationIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build map: appointmentId -> documents[]
    const map = {};
    ids.forEach((id) => { map[id] = []; });
    
    docs.forEach((doc) => {
      // Primary match: appointmentId
      if (doc.appointmentId && map[doc.appointmentId]) {
        map[doc.appointmentId].push(doc);
      } 
      // Secondary match: consultationId (mapped to an appointmentId in our batch)
      else if (doc.consultationId && consultToAppt[doc.consultationId]) {
        const aId = consultToAppt[doc.consultationId];
        if (map[aId]) {
          const alreadyAdded = map[aId].some(d => d.id === doc.id);
          if (!alreadyAdded) {
            map[aId].push(doc);
          }
        }
      }
    });

    res.status(200).json({ success: true, data: map });
  }),
];

/**
 * POST /api/documents/consultations/bulk
 * Returns a map of { consultationId: Document[] }.
 * Internal-only — protected by x-internal-secret header.
 */
const getDocumentsByConsultationsBulk = [
  requireInternalSecret,
  asyncHandler(async (req, res) => {
    const { ids, mappings } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw ApiError.badRequest('ids must be a non-empty array of consultation IDs');
    }

    const consultationIds = ids;
    const appointmentIds = Object.values(mappings || {}).filter(Boolean);

    const prisma = require('../prisma/prisma');
    const docs = await prisma.medicalDocument.findMany({
      where: {
        OR: [
          { consultationId: { in: consultationIds } },
          { appointmentId: { in: appointmentIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build reverse map for easy lookup: appointmentId -> consultationId
    const apptToConsult = {};
    if (mappings) {
      Object.entries(mappings).forEach(([cId, aId]) => {
        if (aId) apptToConsult[aId] = cId;
      });
    }

    // Build map: consultationId -> documents[]
    const map = {};
    consultationIds.forEach((id) => { map[id] = []; });

    docs.forEach((doc) => {
      // Primary match: consultationId
      if (doc.consultationId && map[doc.consultationId]) {
        map[doc.consultationId].push(doc);
      } 
      // Secondary match: appointmentId (if not already added by consultationId)
      else if (doc.appointmentId && apptToConsult[doc.appointmentId]) {
        const cId = apptToConsult[doc.appointmentId];
        if (map[cId]) {
          const alreadyAdded = map[cId].some(d => d.id === doc.id);
          if (!alreadyAdded) {
            map[cId].push(doc);
          }
        }
      }
    });

    res.status(200).json({ success: true, data: map });
  }),
];

module.exports = {
  createDocument,
  getDocumentById,
  getDocumentsByPatient,
  getDocumentsByDoctor,
  getDocumentsByAppointment,
  getDocumentsByConsultation,
  updateDocument,
  deleteDocument,
  // New
  getUploadUrl,
  deleteTempFile,
  confirmUpload,
  confirmUploadBulk,
  getDocumentsByAppointmentsBulk,
  getDocumentsByConsultationsBulk,
  getDocumentUrl
};
