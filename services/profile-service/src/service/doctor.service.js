const prisma = require('../prisma/prisma');
const axios = require('axios');

class DoctorService {
  /**
   * Find doctor by unique fields
   */
  findByUniqueFields({ email, mobile, emiratesId, licenseNumber }) {
    return prisma.doctor.findFirst({
      where: {
        OR: [
          email && { email },
          mobile && { mobile },
          emiratesId && { emiratesId },
          licenseNumber && { licenseNumber }
        ].filter(Boolean)
      }
    });
  }

  async checkDoctorExists({ email, mobile, emiratesId, licenseNumber }) {
    if (email) {
      const doc = await prisma.doctor.findFirst({ where: { email } });
      if (doc) return { exists: true, field: 'email' };
    }
    if (mobile) {
      const doc = await prisma.doctor.findFirst({ where: { mobile } });
      if (doc) return { exists: true, field: 'mobile number' };
    }
    if (emiratesId) {
      const doc = await prisma.doctor.findFirst({ where: { emiratesId } });
      if (doc) return { exists: true, field: 'Emirates ID' };
    }
    if (licenseNumber) {
      const doc = await prisma.doctor.findFirst({ where: { licenseNumber } });
      if (doc) return { exists: true, field: 'license number' };
    }
    return { exists: false };
  }

  /**
   * Find doctors by hospitalId with filters and pagination
   */
  async findDocByHospital(
    { hospitalId },
    filters = {},
    pagination = { page: 1, limit: 20 },
    sortBy = 'name'
  ) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      hospitalId,
      ...this.buildWhereClause(filters)
    };

    const orderBy = this.buildOrderBy(sortBy);

    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy
      }),
      prisma.doctor.count({ where })
    ]);

    return {
      doctors,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async createDoctor(data) {
    // 1️⃣ Check for uniqueness conflicts
    const existingDoctor = await this.findByUniqueFields({
      email: data.email,
      mobile: data.mobile,
      emiratesId: data.emiratesId,
      licenseNumber: data.licenseNumber
    });

    if (existingDoctor) {
      throw new Error(
        'Doctor already exists with given email / mobile / emiratesId / licenseNumber'
      );
    }

    // 2️⃣ Create doctor
    const doctor = await prisma.doctor.create({
      data: {
        userId: data.userId,
        hospitalId: data.hospitalId,
        fullName: data.fullName,
        email: data.email,
        mobile: data.mobile,
        gender: data.gender,
        nationality: data.nationality,
        emiratesId: data.emiratesId,

        primarySpecialization: data.primarySpecialization,
        subSpecialization: data.subSpecialization || null,

        licenseNumber: data.licenseNumber,
        licenseType: data.licenseType,
        licenseExpiry: data.licenseExpiry,

        yearsOfExperience: data.yearsOfExperience,
        medicalDegree: data.medicalDegree,
        university: data.university,
        profileImage: data.profileImage,

        languagesSpoken: data.languagesSpoken || [],
        servicesOffered: data.servicesOffered || [],
        certifications: data.certifications || [],
        professionalMemberships: data.professionalMemberships || [],

        professionalBio: data.professionalBio,

        schedule: data.schedule,

        videoConsultationFee: data.videoConsultationFee,
        phoneConsultationFee: data.phoneConsultationFee,
        followUpFee: data.followUpFee,

        hospitalSharePercent: data.hospitalSharePercent,
        platformSharePercent: data.platformSharePercent
      }
    });

    // 3️⃣ Trigger slot generation if schedule exists
    if (data.schedule) {
      this._triggerSlotRegeneration(doctor.id, doctor.hospitalId, data.schedule, false).catch(
        (err) => console.error('[ProfileService] Slot activation failed:', err.message)
      );
    }

    return doctor;
  }

  /**
   * Build where clause for filtering
   */
  buildWhereClause(filters = {}) {
    const where = {};

    // Handle both old format and new operator-based format
    Object.entries(filters).forEach(([key, value]) => {
      if (!value) {
        return;
      }

      // New operator-based format
      if (typeof value === 'object' && value.op && value.value !== undefined) {
        where[key] = this.applyOperator(value.op, value.value);
        // eslint-disable-next-line brace-style
      }
      // Legacy format - map old filter keys to new structure
      else {
        switch (key) {
          case 'search':
            if (value) {
              where.OR = [
                { fullName: { contains: value, mode: 'insensitive' } },
                { mobile: { contains: value, mode: 'insensitive' } },
                { email: { contains: value, mode: 'insensitive' } },
                { licenseNumber: { contains: value, mode: 'insensitive' } },
                { primarySpecialization: { contains: value, mode: 'insensitive' } }
              ];
            }
            break;

          case 'specialization':
          case 'specialty':
          case 'specialtyName':
            where.primarySpecialization = { contains: value, mode: 'insensitive' };
            break;

          case 'gender':
            where.gender = { equals: value };
            break;

          case 'minExperience':
            where.experience = { gte: parseInt(value, 10) };
            break;

          case 'maxFee':
            where.consultationFee = { lte: parseFloat(value) };
            break;

          case 'workingDay':
            where.workingDays = { has: value };
            break;

          case 'status':
            where.status = { equals: value };
            break;

          case 'availabilityStatus':
            where.availabilityStatus = { equals: value };
            break;

          default:
            // Direct field assignment for unknown keys
            where[key] = value;
        }
      }
    });

    return where;
  }

  applyOperator(op, value) {
    const operators = {
      equals: (val) => ({ equals: val }),
      contains: (val) => ({ contains: val, mode: 'insensitive' }),
      startsWith: (val) => ({ startsWith: val, mode: 'insensitive' }),
      endsWith: (val) => ({ endsWith: val, mode: 'insensitive' }),
      gt: (val) => ({ gt: this.parseValue(val) }),
      gte: (val) => ({ gte: this.parseValue(val) }),
      lt: (val) => ({ lt: this.parseValue(val) }),
      lte: (val) => ({ lte: this.parseValue(val) }),
      in: (val) => ({ in: Array.isArray(val) ? val : [val] }),
      notIn: (val) => ({ notIn: Array.isArray(val) ? val : [val] }),
      not: (val) => ({ not: val }),
      has: (val) => ({ has: val }),
      hasSome: (val) => ({ hasSome: Array.isArray(val) ? val : [val] }),
      hasEvery: (val) => ({ hasEvery: Array.isArray(val) ? val : [val] })
    };

    return operators[op] ? operators[op](value) : { equals: value };
  }
  /**
   * Build orderBy clause
   */
  buildOrderBy(sortBy = 'name') {
    switch (sortBy) {
      case 'experience':
        return [{ yearsOfExperience: 'desc' }, { fullName: 'asc' }];
      case 'fee-low':
        return [{ videoConsultationFee: 'asc' }, { fullName: 'asc' }];
      case 'fee-high':
        return [{ videoConsultationFee: 'desc' }, { fullName: 'asc' }];
      case 'recent':
        return { createdAt: 'desc' };
      case 'name':
      default:
        return { fullName: 'asc' };
    }
  }

  parseValue(val) {
    if (typeof val === 'number') {
      return val;
    }
    const num = parseFloat(val);
    return isNaN(num) ? val : num;
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
   * Find doctor by ID or by userId (auth user id)
   */
  async findByIdOrUserId(id) {
    const byId = await prisma.doctor.findUnique({ where: { id } });
    if (byId) {
      return byId;
    }
    return prisma.doctor.findUnique({ where: { userId: id } });
  }

  async getAvailability(id) {
    const doctor = await this.findByIdOrUserId(id);
    if (!doctor) {
      return null;
    }
    return { status: doctor.availabilityStatus };
  }

  async setAvailability(id, status) {
    const doctor = await this.findByIdOrUserId(id);
    if (!doctor) {
      return null;
    }
    return prisma.doctor.update({
      where: { id: doctor.id },
      data: { availabilityStatus: status }
    });
  }

  findAll() {
    return prisma.doctor.findMany();
  }

  /**
   * Find doctors with filters and pagination (global listing)
   */
  async findAllWithFilters(
    filters = {},
    pagination = { page: 1, limit: 20 },
    sortBy = 'experience'
  ) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(filters);
    const orderBy = this.buildOrderBy(sortBy);

    const [doctors, total] = await Promise.all([
      prisma.doctor.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy
      }),
      prisma.doctor.count({ where })
    ]);

    return {
      doctors,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

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

  findConflictingDoctor(id, { email, mobile, emiratesId, licenseNumber }) {
    if (!email && !mobile && !emiratesId && !licenseNumber) {
      return null;
    }

    return prisma.doctor.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              email && { email },
              mobile && { mobile },
              emiratesId && { emiratesId },
              licenseNumber && { licenseNumber }
            ].filter(Boolean)
          }
        ]
      }
    });
  }

  async update(id, data) {
    const doctor = await prisma.doctor.update({
      where: { id },
      data
    });

    // If schedule is updated, trigger slot regeneration in appointment-service
    if (data.schedule) {
      this._triggerSlotRegeneration(doctor.id, doctor.hospitalId, data.schedule, true).catch(
        (err) => console.error('[ProfileService] Slot regeneration failed:', err.message)
      );
    }

    return doctor;
  }

  async _triggerSlotRegeneration(doctorId, hospitalId, schedule, isUpdate) {
    // Determine the base URL for appointment service.
    // In local development, we call via the Gateway.
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';

    try {
      await axios.post(`${baseUrl}/appointments/slots/bulk`, {
        doctorId,
        hospitalId,
        schedule,
        isUpdate
      });
      console.log(`[ProfileService] Success: Slot regeneration triggered for doctor ${doctorId}`);
    } catch (error) {
      console.error(
        '[ProfileService] Failed to trigger slot sync:',
        error.response?.data?.message || error.message
      );
    }
  }

  /**
   * Delete doctor by ID
   */
  delete(id) {
    return prisma.doctor.delete({
      where: { id }
    });
  }

  findByIdsOrUserIds(ids) {
    return prisma.doctor.findMany({
      where: {
        OR: [{ id: { in: ids } }, { userId: { in: ids } }]
      }
    });
  }

  /**
   * Find multiple doctors strictly by their primary doctor ID.
   */
  findByIds(ids) {
    return prisma.doctor.findMany({
      where: {
        id: { in: ids }
      }
    });
  }
}

module.exports = new DoctorService();
