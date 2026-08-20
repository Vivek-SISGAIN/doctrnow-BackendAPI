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
   * Find hospital admin by ID or userId
   */
  findById(id) {
    return prisma.hospitalAdmin.findFirst({
      where: {
        OR: [
          { id },
          { userId: id }
        ]
      }
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
   * Find hospital admins by hospitalId
   */
  findByHospitalId(hospitalId) {
    return prisma.hospitalAdmin.findMany({
      where: { hospitalId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createHospitalAdmin(data) {
    // 1️⃣ Check for uniqueness conflicts
    const existingAdmin = await prisma.hospitalAdmin.findFirst({
      where: {
        OR: [
          { email: data.email },
          { phoneNumber: data.phoneNumber },
          { emiratesId: data.emiratesId },
          { userId: data.userId }
        ]
      }
    });

    if (existingAdmin) {
      throw new Error(
        'Hospital admin already exists with given email / phoneNumber / emiratesId / userId'
      );
    }

    // 2️⃣ Create hospital admin
    return prisma.hospitalAdmin.create({
      data: {
        userId: data.userId,

        fullName: data.fullName,
        email: data.email,
        phoneNumber: data.phoneNumber,

        gender: data.gender,
        nationality: data.nationality,
        emiratesId: data.emiratesId,

        hospitalName: data.hospitalName,
        hospitalId: data.hospitalId,

        position: data.position,
        department: data.department || null,

        profileImage: data.profileImage || '',
        subRole: data.subRole || 'ADMIN',
        permissions: Array.isArray(data.permissions) ? data.permissions : []
      }
    });
  }

  /**
   * Find all hospital admins with filters & pagination
   */
  async findAll(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { page = 1, limit = 20 } = pagination;

    const skip = (page - 1) * limit;

    // Build where clause using existing helper
    const where = this.buildWhereClause(filters);

    const [admins, total] = await Promise.all([
      prisma.hospitalAdmin.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.hospitalAdmin.count({ where })
    ]);

    return {
      data: admins,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
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
   * Update hospital admin by ID or userId
   */
  async update(id, data) {
    const admin = await this.findById(id);
    if (!admin) return null;

    const {
      id: _id,
      userId: _userId,
      createdAt,
      updatedAt,
      ...prismaData
    } = data;

    return prisma.hospitalAdmin.update({
      where: { id: admin.id },
      data: prismaData
    });
  }

  /**
   * Delete hospital admin by ID or userId
   */
  async delete(id) {
    const admin = await this.findById(id);
    if (!admin) return null;

    return prisma.hospitalAdmin.delete({
      where: { id: admin.id }
    });
  }
}

module.exports = new HospitalAdminService();
