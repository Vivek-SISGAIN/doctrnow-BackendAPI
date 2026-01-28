const prisma = require('../prisma/prisma');

class DoctorService {
  /**
   * Find doctor by unique fields
   */
  findByUniqueFields({ email, phoneNumber, emiratesId, licenseNumber }) {
    return prisma.doctor.findFirst({
      where: {
        OR: [
          email && { email },
          phoneNumber && { phoneNumber },
          emiratesId && { emiratesId },
          licenseNumber && { licenseNumber }
        ].filter(Boolean)
      }
    });
  }

  /**
   * Build where clause for filtering
   */
  buildWhereClause({ search, specialization, gender, minExperience, maxFee, workingDay }) {
    const where = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { primarySpecialization: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (specialization) {
      where.primarySpecialization = { contains: specialization, mode: 'insensitive' };
    }

    if (gender) {
      where.gender = gender;
    }

    if (minExperience) {
      where.yearsOfExperience = { gte: parseInt(minExperience) };
    }

    if (maxFee) {
      where.videoConsultationFee = { lte: parseFloat(maxFee) };
    }

    if (workingDay) {
      where.workingDays = { has: workingDay };
    }

    return where;
  }

  /**
   * Find doctor by ID
   */
  findById(id) {
    return prisma.doctor.findUnique({
      where: { id }
    });
  }

  /**
   * Search doctors by specialization
   */
  searchBySpecialization(query) {
    return prisma.doctor.findMany({
      where: {
        OR: [
          { primarySpecialization: { contains: query, mode: 'insensitive' } },
          { subSpecialization: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        fullName: true,
        primarySpecialization: true,
        subSpecialization: true,
        yearsOfExperience: true,
        videoConsultationFee: true,
        phoneConsultationFee: true
      }
    });
  }

  /**
   * Check for conflicts when updating unique fields
   */
  findConflictingDoctor(id, { email, phoneNumber, emiratesId, licenseNumber }) {
    if (!email && !phoneNumber && !emiratesId && !licenseNumber) {
      return null;
    }

    return prisma.doctor.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              email && { email },
              phoneNumber && { phoneNumber },
              emiratesId && { emiratesId },
              licenseNumber && { licenseNumber }
            ].filter(Boolean)
          }
        ]
      }
    });
  }

  /**
   * Update doctor by ID
   */
  update(id, data) {
    return prisma.doctor.update({
      where: { id },
      data
    });
  }

  /**
   * Delete doctor by ID
   */
  delete(id) {
    return prisma.doctor.delete({
      where: { id }
    });
  }
}

module.exports = new DoctorService();
