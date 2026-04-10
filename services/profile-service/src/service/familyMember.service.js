const prisma = require('../prisma/prisma');

class FamilyMemberService {
  /**
   * Find patient by ID
   */
  findPatientById(patientId) {
    return prisma.patient.findUnique({
      where: { id: patientId }
    });
  }

  /**
   * Check if Emirates ID already exists
   */
  findByEmiratesId(emiratesId) {
    if (!emiratesId) {
      return null;
    }
    return prisma.familyMember.findFirst({
      where: { emiratesId },
      select: {
        id: true,
        emiratesId: true
      }
    });
  }

  /**
   * Build where clause for filtering
   */
  buildWhereClause({ patientId, relationshipType, isEmergencyContact }) {
    const where = {};

    if (patientId) {
      where.patientId = patientId;
    }
    if (relationshipType) {
      where.relationshipType = relationshipType;
    }
    if (isEmergencyContact !== undefined) {
      where.isEmergencyContact = isEmergencyContact === 'true';
    }

    return where;
  }

  /**
   * Find family member by ID
   */
  findById(id) {
    return prisma.familyMember.findUnique({
      where: { id }
    });
  }

  /**
   * Find family members by patient ID
   */
  findByPatientId(patientId) {
    return prisma.familyMember.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Check for Emirates ID conflict when updating
   */
  findConflictingEmiratesId(id, emiratesId) {
    if (!emiratesId) {
      return null;
    }

    return prisma.familyMember.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          { emiratesId }
        ]
      },
      select: {
        id: true,
        emiratesId: true
      }
    });
  }

  /**
   * Create family member for a patient
   */
  create(data) {
    return prisma.familyMember.create({
      data: {
        patientId: data.patientId,
        relationshipType: data.relationshipType,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        nationality: data.nationality,
        emiratesId: data.emiratesId || null,
        mobileNumber: data.mobileNumber || null,
        email: data.email || null,
        bloodGroup: data.bloodGroup || null,
        isEmergencyContact: data.isEmergencyContact === true
      }
    });
  }

  /**
   * Update family member by ID
   */
  update(id, data) {
    const updateData = { ...data };
    if (data.dateOfBirth) {updateData.dateOfBirth = new Date(data.dateOfBirth);}
    return prisma.familyMember.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * Delete family member by ID
   */
  delete(id) {
    return prisma.familyMember.delete({
      where: { id }
    });
  }
}

module.exports = new FamilyMemberService();
