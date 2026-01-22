const prisma = require('../prisma/prisma');

class HospitalAdminService {
  /**
   * Find hospital admin by unique fields
   */
  findByUniqueFields({ email, phoneNumber, emiratesId }) {
    return prisma.hospitalAdmin.findFirst({
      where: {
        OR: [
          email && { email },
          phoneNumber && { phoneNumber },
          emiratesId && { emiratesId }
        ].filter(Boolean)
      }
    });
  }

  /**
   * Build where clause for filtering
   */
  buildWhereClause({ search, hospitalName, gender }) {
    const where = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { hospitalName: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (hospitalName) {
      where.hospitalName = { contains: hospitalName, mode: 'insensitive' };
    }

    if (gender) {
      where.gender = gender;
    }

    return where;
  }

  /**
   * Find hospital admin by ID
   */
  findById(id) {
    return prisma.hospitalAdmin.findUnique({
      where: { id }
    });
  }

  /**
   * Find hospital admins by hospital name
   */
  findByHospitalName(hospitalName) {
    return prisma.hospitalAdmin.findMany({
      where: {
        hospitalName: {
          contains: hospitalName,
          mode: 'insensitive'
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Check for conflicts when updating unique fields
   */
  findConflictingAdmin(id, { email, phoneNumber, emiratesId }) {
    if (!email && !phoneNumber && !emiratesId) {
      return null;
    }

    return prisma.hospitalAdmin.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              email && { email },
              phoneNumber && { phoneNumber },
              emiratesId && { emiratesId }
            ].filter(Boolean)
          }
        ]
      }
    });
  }

  /**
   * Update hospital admin by ID
   */
  update(id, data) {
    return prisma.hospitalAdmin.update({
      where: { id },
      data
    });
  }

  /**
   * Delete hospital admin by ID
   */
  delete(id) {
    return prisma.hospitalAdmin.delete({
      where: { id }
    });
  }
}

module.exports = new HospitalAdminService();
