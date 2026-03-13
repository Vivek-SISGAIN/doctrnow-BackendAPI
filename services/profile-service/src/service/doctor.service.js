const prisma = require('../prisma/prisma');

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

 async findDocByHospital({ hospitalId }) {
  return prisma.doctor.findMany({
    where: { hospitalId }
  });
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
      throw new Error('Doctor already exists with given email / mobile / emiratesId / licenseNumber');
    }

    // 2️⃣ Create doctor
    return prisma.doctor.create({
      data: {
        userId: data.userId,
        hospitalId : data.hospitalId,
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
      where.primarySpecialization = { equals: specialization, mode: 'insensitive' };
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
   * Find doctor by ID or by userId (auth user id)
   */
  async findByIdOrUserId(id) {
    const byId = await prisma.doctor.findUnique({ where: { id } });
    if (byId) return byId;
    return prisma.doctor.findUnique({ where: { userId: id } });
  }

  async getAvailability(id) {
    const doctor = await this.findByIdOrUserId(id);
    if (!doctor) return null;
    return { status: doctor.availabilityStatus };
  }

  async setAvailability(id, status) {
    const doctor = await this.findByIdOrUserId(id);
    if (!doctor) return null;
    return prisma.doctor.update({
      where: { id: doctor.id },
      data: { availabilityStatus: status }
    });
  }

  findAll() {
    return prisma.doctor.findMany();
  }

  /**
   * Find doctors with optional filters (for listing by specialty, search, etc.)
   * specialtyName: filter by primarySpecialization (case-insensitive match)
   */
  async findAllWithFilters(filters = {}) {
    const where = this.buildWhereClause({
      search: filters.search,
      specialization: filters.specialty || filters.specialtyName,
      gender: filters.gender,
      minExperience: filters.minExperience,
      maxFee: filters.maxFee,
      workingDay: filters.workingDay
    });


    return prisma.doctor.findMany({
      where,
      orderBy: [{ yearsOfExperience: 'desc' }, { fullName: 'asc' }]
    });
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
