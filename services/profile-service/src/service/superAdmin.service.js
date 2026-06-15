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
  buildWhereClause({ search, gender } = {}) {
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
   * Build orderBy clause
   */
  buildOrderBy(sortBy = 'recent') {
    switch (sortBy) {
      case 'name':
        return { fullName: 'asc' };
      case 'email':
        return { email: 'asc' };
      case 'recent':
      default:
        return { createdAt: 'desc' };
    }
  }

  /**
   * Find all super admins with filters and pagination
   */
  async findAllAdmins(filters = {}, pagination = { page: 1, limit: 20 }, sortBy = 'recent') {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause({
      search: filters.search,
      gender: filters.gender
    });

    const orderBy = this.buildOrderBy(sortBy);

    const [admins, total] = await Promise.all([
      prisma.superAdmin.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy
      }),
      prisma.superAdmin.count({ where })
    ]);

    return {
      admins,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Find super admin by ID
   */
  findById(id) {
    return prisma.superAdmin.findFirst({
      where: {
        OR: [{ id }, { userId: id }]
      }
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
    const {
      id: _id,
      userId: _userId,
      createdAt,
      updatedAt,
      ...prismaData
    } = data;

    return prisma.superAdmin.update({
      where: { id },
      data: prismaData
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

  /**
   * Create super admin — registers user in auth-service, then creates profile
   */
  async createSuperAdmin({
    fullName,
    email,
    phoneNumber,
    gender,
    nationality,
    emiratesId,
    profileImage,
    password
  }) {
    const axios = require('axios');

    let createdUserId = null;

    try {
      // 1. Create user account in auth-service
      const authResponse = await axios.post('http://localhost:8080/api/v1/auth/register', {
        email,
        password,
        role: 'SUPER_ADMIN',
        tenantId: '00000000-0000-0000-0000-000000000001'
      });

      createdUserId = authResponse.data.userId;

      // 2. Create super admin profile
      const superAdmin = await prisma.superAdmin.create({
        data: {
          userId: createdUserId,
          fullName,
          email,
          phoneNumber,
          gender,
          nationality,
          emiratesId,
          profileImage: profileImage || ''
        }
      });

      return superAdmin;
    } catch (error) {
      // 3. Rollback: delete user from auth-service if profile creation failed
      if (createdUserId) {
        try {
          await axios.delete(`http://localhost:3001/auth/v1/users/${createdUserId}`);
        } catch (cleanupError) {
          console.error('Failed to rollback user creation:', cleanupError.message);
        }
      }
      throw error;
    }
  }
}

module.exports = new SuperAdminService();
