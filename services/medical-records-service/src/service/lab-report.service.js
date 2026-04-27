const prisma = require('../prisma/prisma');

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8080/api/v1';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || process.env.INTERNAL_SERVICE_SECRET;

async function fetchBulk(ids, path) {
  if (!ids || ids.length === 0) return {};

  try {
    const response = await fetch(`${API_GATEWAY_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-service-key': INTERNAL_SERVICE_KEY } : {}),
      },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) return {};
    const json = await response.json();
    return json.data || {};
  } catch (error) {
    console.warn(`[LabReportService] Bulk fetch failed for ${path}:`, error.message);
    return {};
  }
}

function personName(profile, fallback) {
  if (!profile) return fallback;
  return (
    profile.fullName ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
    profile.name ||
    fallback
  );
}

function generateReportId(patientId) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const suffix = patientId.replace(/-/g, '').slice(-6) || String(Date.now()).slice(-6);
  return 'LAB-' + y + m + day + '-' + suffix;
}

async function create(data) {
  const reportId = data.reportId || generateReportId(data.patientId);
  return prisma.labReport.create({
    data: {
      patientId: data.patientId,
      doctorId: data.doctorId,
      appointmentId: data.appointmentId,
      consultationId: data.consultationId,
      reportId,
      consultationDate: data.consultationDate ? new Date(data.consultationDate) : null,
      consultationTime: data.consultationTime,
      orderedTests: data.orderedTests || [],
      status: data.status || 'PENDING',
      priority: data.priority || 'ROUTINE',
      notes: data.notes,
      results: data.results || null,
    },
  });
}

async function findById(id) {
  return prisma.labReport.findUnique({ where: { id } });
}

async function findByDoctorId(doctorId, filters = {}) {
  const { status, page = 1, limit = 100 } = filters;
  const skip = (page - 1) * limit;
  const where = { doctorId };
  if (status) where.status = status;
  const [reports, total] = await Promise.all([
    prisma.labReport.findMany({
      where,
      skip,
      take: parseInt(limit, 10),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.labReport.count({ where }),
  ]);
  return {
    reports,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function findByPatientId(patientId, filters = {}) {
  const { status, limit = 50 } = filters;
  const where = { patientId };
  if (status) where.status = status;
  return prisma.labReport.findMany({
    where,
    take: parseInt(limit, 10),
    orderBy: { createdAt: 'desc' },
  });
}

async function update(id, data) {
  const existing = await prisma.labReport.findUnique({ where: { id } });
  if (!existing) throw new Error('Lab report not found');
  const updateData = {};
  if (data.consultationDate !== undefined) updateData.consultationDate = data.consultationDate ? new Date(data.consultationDate) : null;
  if (data.consultationTime !== undefined) updateData.consultationTime = data.consultationTime;
  if (data.orderedTests !== undefined) updateData.orderedTests = data.orderedTests;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.resultDate !== undefined) updateData.resultDate = data.resultDate ? new Date(data.resultDate) : null;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.results !== undefined) updateData.results = data.results;
  if (data.isReviewed !== undefined) updateData.isReviewed = data.isReviewed;
  if (data.reviewedAt !== undefined) updateData.reviewedAt = data.reviewedAt ? new Date(data.reviewedAt) : null;
  if (data.reviewComments !== undefined) updateData.reviewComments = data.reviewComments;
  if (data.sentToPatient !== undefined) updateData.sentToPatient = data.sentToPatient;
  if (data.sentAt !== undefined) updateData.sentAt = data.sentAt ? new Date(data.sentAt) : null;
  const updated = await prisma.labReport.update({ where: { id }, data: updateData });

  // If newly sent to patient, trigger notification
  if (data.sentToPatient === true) {
    const prescriptionNotificationService = require('./prescription-notification.service');
    const [doctorMap, patientMap] = await Promise.all([
      fetchBulk([updated.doctorId].filter(Boolean), '/profiles/doctors/bulk'),
      fetchBulk([updated.patientId].filter(Boolean), '/profiles/patients/bulk'),
    ]);
    const doctor = doctorMap[updated.doctorId] || null;
    const patient = patientMap[updated.patientId] || null;
    const doctorName = personName(doctor, String(updated.doctorId || '').substring(0, 8));
    const patientName = personName(patient, String(updated.patientId || '').substring(0, 8));

    prescriptionNotificationService.sendLabReportNotification({
      userId: updated.patientId,
      patientName,
      doctorName,
      reportId: updated.reportId,
      doctorId: updated.doctorId,
      hospitalId: updated.hospitalId || doctor?.hospitalId,
    }).catch(err => console.error('[LabReportService] Notification failed:', err));
  }

  return updated;
}

async function deleteById(id) {
  const existing = await prisma.labReport.findUnique({ where: { id } });
  if (!existing) throw new Error('Lab report not found');
  await prisma.labReport.delete({ where: { id } });
  return { message: 'Lab report deleted successfully' };
}

module.exports = {
  create,
  findById,
  findByDoctorId,
  findByPatientId,
  update,
  delete: deleteById,
};
