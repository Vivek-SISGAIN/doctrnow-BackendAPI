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
      where: { emiratesId }
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
      }
    });
  }

  /**
   * Update family member by ID
   */
  update(id, data) {
    return prisma.familyMember.update({
      where: { id },
      data
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
