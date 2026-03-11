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
      // Returns all fields by default
    });
  }
  /**
   * Build where clause for filtering
   */
  buildWhereClause({ search, gender, bloodGroup, maritalStatus, riskCategory, patientType, followUpStatus }) {
    const where = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { mobileNumber: { contains: search } },
         { mrn: { contains: search, mode: 'insensitive' } },
         { insuranceId: { contains: search, mode: 'insensitive' } }
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
    if (riskCategory) {
      where.riskCategory = riskCategory;
    }
    if (patientType) {
      where.patientType = patientType;
    }
    if (followUpStatus) {
      where.followUpStatus = followUpStatus;
    }

    return where;
  }

  /**
   * Find all patients with filtering, pagination, and sorting
   */
  async findAll(filters = {}, pagination = { page: 1, limit: 20 }, sortBy = 'recent') {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(filters);

    // Build orderBy clause using the actual fields
    let orderBy = {};
    switch (sortBy) {
      case 'recent':
        // Sort by lastVisit (most recent first)
        // Null values will be sorted last by default
        orderBy = { lastVisit: 'desc' };
        break;
      case 'name':
        orderBy = { firstName: 'asc' };
        break;
      case 'visits':
        orderBy = { totalVisits: 'desc' };
        break;
      case 'risk-high':
        // Sort by risk category: HIGH, MEDIUM, LOW
        // Note: Enum sorting is alphabetical, so we use desc to get HIGH first
        orderBy = [
          { riskCategory: 'desc' },
          { createdAt: 'desc' }
        ];
        break;
      case 'risk-low':
        // Sort by risk category: LOW, MEDIUM, HIGH
        // Note: Enum sorting is alphabetical, so we use asc to get LOW first
        orderBy = [
          { riskCategory: 'asc' },
          { createdAt: 'desc' }
        ];
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // Fetch all patients with all fields (migration complete)
    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy
        // Returns all fields by default
      }),
      prisma.patient.count({ where })
    ]);

    return {
      patients,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Find patient by ID
   * Returns all patient fields
   */
  findById(id) {
    return prisma.patient.findUnique({
      where: { id }
      // Returns all fields by default
    });
  }

  /**
   * Find patient by auth userId (for "current user" profile)
   */
  findByUserId(userId) {
    return prisma.patient.findUnique({
      where: { userId }
    });
  }

  /**
   * Create patient profile for current user (after registration).
   * Called with userId from X-User-ID; body must include required patient fields.
   */
  async createForUser(userId, data) {
    const existing = await this.findByUserId(userId);
    if (existing) {
      throw new Error('Patient profile already exists for this user');
    }
    return prisma.patient.create({
      data: {
        userId,
        email: data.email,
        mobileNumber: data.mobileNumber || '',
        profileImage: data.profileImage || '',
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        emiratesId: data.emiratesId,
        nationality: data.nationality,
        bloodGroup: data.bloodGroup || null,
        maritalStatus: data.maritalStatus || null
      }
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
      },
      // Select only id and unique fields for conflict check
      select: {
        id: true,
        mobileNumber: true,
        email: true,
        emiratesId: true,
      }
    });
  }

  /**
   * Update patient by ID
   */
  update(id, data) {
    return prisma.patient.update({
      where: { id },
      data: {
        ...data,
        dateOfBirth : new Date(data.dateOfBirth),
      }
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
