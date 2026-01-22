const prisma = require('../prisma/prisma');

class SuperAdminService {
  /**
   * Find super admin by unique fields
   */
  findByUniqueFields({ email, phoneNumber, emiratesId }) {
    return prisma.superAdmin.findFirst({
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
  buildWhereClause({ search, gender }) {
    const where = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } }
      ];
    }

    if (gender) {
      where.gender = gender;
    }

    return where;
  }

  /**
   * Find super admin by ID
   */
  findById(id) {
    return prisma.superAdmin.findUnique({
      where: { id }
    });
  }

  /**
   * Count total super admins
   */
  count() {
    return prisma.superAdmin.count();
  }

  /**
   * Check for conflicts when updating unique fields
   */
  findConflictingAdmin(id, { email, phoneNumber, emiratesId }) {
    if (!email && !phoneNumber && !emiratesId) {
      return null;
    }

    return prisma.superAdmin.findFirst({
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
   * Update super admin by ID
   */
  update(id, data) {
    return prisma.superAdmin.update({
      where: { id },
      data
    });
  }

  /**
   * Delete super admin by ID
   */
  delete(id) {
    return prisma.superAdmin.delete({
      where: { id }
    });
  }
}

module.exports = new SuperAdminService();
