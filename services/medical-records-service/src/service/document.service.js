const prisma = require('../prisma/prisma');

class DocumentService {
  /**
   * Create a new medical document
   */
  async create(data) {
    const document = await prisma.medicalDocument.create({
      data: {
        patientId: data.patientId,
        doctorId: data.doctorId,
        appointmentId: data.appointmentId,
        consultationId: data.consultationId,
        name: data.name,
        type: data.type,
        filePath: data.filePath || '',
        fileSize: data.fileSize ?? 0,
        mimeType: data.mimeType,
        uploadedBy: data.uploadedBy,
        description: data.description
      }
    });

    return document;
  }

  /**
   * Find document by ID
   */
  async findById(id) {
    const document = await prisma.medicalDocument.findUnique({
      where: { id }
    });

    return document;
  }

  /**
   * Find documents by patient ID
   */
  async findByPatientId(patientId, filters = {}) {
    const { type, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = { patientId };
    if (type) {
      where.type = type;
    }

    const [documents, total] = await Promise.all([
      prisma.medicalDocument.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.medicalDocument.count({ where })
    ]);

    return {
      documents,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Find documents by doctor ID
   */
  async findByDoctorId(doctorId, filters = {}) {
    const { type, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = { doctorId };
    if (type) {
      where.type = type;
    }

    const [documents, total] = await Promise.all([
      prisma.medicalDocument.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.medicalDocument.count({ where })
    ]);

    return {
      documents,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Find documents by appointment ID
   */
  async findByAppointmentId(appointmentId) {
    const documents = await prisma.medicalDocument.findMany({
      where: { appointmentId },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return documents;
  }

  /**
   * Find documents by consultation ID
   */
  async findByConsultationId(consultationId) {
    const documents = await prisma.medicalDocument.findMany({
      where: { consultationId },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return documents;
  }

  /**
   * Update document
   */
  async update(id, data) {
    const document = await prisma.medicalDocument.findUnique({
      where: { id }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;

    const updated = await prisma.medicalDocument.update({
      where: { id },
      data: updateData
    });

    return updated;
  }

  /**
   * Delete document
   */
  async delete(id) {
    const document = await prisma.medicalDocument.findUnique({
      where: { id }
    });

    if (!document) {
      throw new Error('Document not found');
    }

    await prisma.medicalDocument.delete({
      where: { id }
    });

    return { message: 'Document deleted successfully' };
  }
}

module.exports = new DocumentService();
