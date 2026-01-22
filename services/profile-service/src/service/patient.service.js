const prisma = require('../prisma/prisma');

class PatientService {
  /**
   * Find patient by unique fields (mobileNumber, email, emiratesId)
   */
  findByUniqueFields({ mobileNumber, email, emiratesId }) {
    return prisma.patient.findFirst({
      where: {
        OR: [
          mobileNumber && { mobileNumber },
          email && { email },
          emiratesId && { emiratesId }
        ].filter(Boolean)
      }
    });
  }
  /**
   * Build where clause for filtering
   */
  buildWhereClause({ search, gender, bloodGroup, maritalStatus }) {
    const where = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { mobileNumber: { contains: search } }
      ];
    }

    if (gender) {
      where.gender = gender;
    }
    if (bloodGroup) {
      where.bloodGroup = bloodGroup;
    }
    if (maritalStatus) {
      where.maritalStatus = maritalStatus;
    }

    return where;
  }

  /**
   * Find patient by ID
   */
  findById(id) {
    return prisma.patient.findUnique({
      where: { id }
    });
  }

  /**
   * Check for conflicts when updating unique fields
   */
  findConflictingPatient(id, { mobileNumber, email, emiratesId }) {
    if (!mobileNumber && !email && !emiratesId) {
      return null;
    }

    return prisma.patient.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              mobileNumber && { mobileNumber },
              email && { email },
              emiratesId && { emiratesId }
            ].filter(Boolean)
          }
        ]
      }
    });
  }

  /**
   * Update patient by ID
   */
  update(id, data) {
    return prisma.patient.update({
      where: { id },
      data
    });
  }

  /**
   * Delete patient by ID
   */
  delete(id) {
    return prisma.patient.delete({
      where: { id }
    });
  }
}

module.exports = new PatientService();
