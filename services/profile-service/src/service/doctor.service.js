const { Prisma } = require('@prisma/client');
const prisma = require('../prisma/prisma');
const axios = require('axios');
const { getPresignedS3Url } = require('../utils/s3Handler');

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

    // ── Inter-service filtering (Hospital attributes) ───────────────────────
    const filteredHospitalIds = await this._fetchHospitalIdsByFilters(filters);

    // If hospital filters were applied and they DON'T include this hospital, return empty
    if (filteredHospitalIds !== null && !filteredHospitalIds.includes(hospitalId)) {
      return {
        doctors: [],
        pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total: 0, totalPages: 0 }
      };
    }

    const where = {
      OR: [{ hospitalId }, { assignedHospitalIds: { has: hospitalId } }],
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

    const enrichedDoctors = await this._enrichDoctorProfiles(doctors);

    return {
      doctors: enrichedDoctors,
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
        profileImage: data.profileImage || '',

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
    await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        assignedHospitalIds: {
          push: data.hospitalId
        }
      }
    });
    // 3️⃣ Trigger slot generation if schedule exists
    if (data.schedule) {
      this._triggerSlotRegeneration(doctor.id, doctor.hospitalId, data.schedule, false).catch(
        (err) => console.error('[ProfileService] Slot activation failed:', err.message)
      );
    }

    return this._populatePresignedUrls(doctor);
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
            where.gender = { equals: value.toUpperCase() };
            break;

          case 'languages':
            {
              const langs = Array.isArray(value) ? value : value.split(',').map((l) => l.trim());
              where.languagesSpoken = { hasSome: langs };
            }
            break;

          case 'countries':
            {
              const counts = Array.isArray(value) ? value : value.split(',').map((c) => c.trim());
              where.nationality = { in: counts };
            }
            break;

          case 'minExperience':
            where.yearsOfExperience = { gte: parseInt(value, 10) };
            break;

          case 'maxFee':
            where.videoConsultationFee = { lte: parseFloat(value) };
            break;

          case 'workingDay':
            where.schedule = {
              path: [value.toUpperCase()],
              not: Prisma.AnyNull
            };
            break;

          case 'status':
            where.status = { equals: value.toUpperCase() };
            break;

          case 'availabilityStatus':
            where.availabilityStatus = { equals: value.toUpperCase() };
            break;

          case 'facility':
          case 'emirate':
          case 'distanceRange':
          case 'lat':
          case 'lng':
            // These are handled by _fetchHospitalIdsByFilters
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
  async findById(id) {
    const doctor = await prisma.doctor.findUnique({
      where: { id }
    });
    return this._enrichDoctorProfiles(doctor);
  }

  /**
   * Find doctor by ID or by userId (auth user id)
   */
  async findByIdOrUserId(id) {
    let doctor = await prisma.doctor.findUnique({ where: { id } });
    if (!doctor) {
      doctor = await prisma.doctor.findUnique({ where: { userId: id } });
    }
    return this._enrichDoctorProfiles(doctor);
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

  async findAll() {
    const doctors = await prisma.doctor.findMany();
    return this._populatePresignedUrls(doctors);
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

    // ── Inter-service filtering (Hospital attributes) ───────────────────────
    const filteredHospitalIds = await this._fetchHospitalIdsByFilters(filters);

    const where = this.buildWhereClause(filters);

    // If hospital filters were applied, restrict the doctor query
    if (filteredHospitalIds !== null) {
      if (filteredHospitalIds.length === 0) {
        return {
          doctors: [],
          pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total: 0, totalPages: 0 }
        };
      }
      where.hospitalId = { in: filteredHospitalIds };
    }

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

    const enrichedDoctors = await this._enrichDoctorProfiles(doctors);

    return {
      doctors: enrichedDoctors,
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

    return this._populatePresignedUrls(doctor);
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

  async findByIdsOrUserIds(ids, search = "") {
    const where = {
      OR: [{ id: { in: ids } }, { userId: { in: ids } }]
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { primarySpecialization: { contains: search, mode: "insensitive" } },
            { mobile: { contains: search, mode: "insensitive" } }
          ]
        }
      ];
    }

    const doctors = await prisma.doctor.findMany({
      where
    });
    return this._enrichDoctorProfiles(doctors);
  }

  /**
   * Find multiple doctors strictly by their primary doctor ID.
   */
  async findByIds(ids) {
    const doctors = await prisma.doctor.findMany({
      where: {
        id: { in: ids }
      }
    });
    return this._enrichDoctorProfiles(doctors);
  }

  async _enrichDoctorProfiles(doctors) {
    if (!doctors) return doctors;
    const populated = await this._populatePresignedUrls(doctors);
    const rated = await this._attachRatings(populated);
    return this._attachHospitalDetails(rated);
  }

  async _populatePresignedUrls(data) {
    if (!data) return data;
    const isArray = Array.isArray(data);
    const elements = isArray ? data : [data];
    const documentKeyMap = [
      {
        key: 'medicalLicense',
        s3KeyField: 'docMedicalLicenseKey',
        statusField: 'docMedicalLicenseStatus',
        fileNameField: 'docMedicalLicenseFileName',
        mimeField: 'docMedicalLicenseMime'
      },
      {
        key: 'emiratesId',
        s3KeyField: 'docEmiratesIdKey',
        statusField: 'docEmiratesIdStatus',
        fileNameField: 'docEmiratesIdFileName',
        mimeField: 'docEmiratesIdMime'
      },
      {
        key: 'passport',
        s3KeyField: 'docPassportKey',
        statusField: 'docPassportStatus',
        fileNameField: 'docPassportFileName',
        mimeField: 'docPassportMime'
      },
      {
        key: 'medicalDegree',
        s3KeyField: 'docMedicalDegreeKey',
        statusField: 'docMedicalDegreeStatus',
        fileNameField: 'docMedicalDegreeFileName',
        mimeField: 'docMedicalDegreeMime'
      },
      {
        key: 'specialistCert',
        s3KeyField: 'docSpecialistCertKey',
        statusField: 'docSpecialistCertStatus',
        fileNameField: 'docSpecialistCertFileName',
        mimeField: 'docSpecialistCertMime'
      },
      {
        key: 'cvResume',
        s3KeyField: 'docCvResumeKey',
        statusField: 'docCvResumeStatus',
        fileNameField: 'docCvResumeFileName',
        mimeField: 'docCvResumeMime'
      },
      {
        key: 'goodStanding',
        s3KeyField: 'docGoodStandingKey',
        statusField: 'docGoodStandingStatus',
        fileNameField: 'docGoodStandingFileName',
        mimeField: 'docGoodStandingMime'
      },
      {
        key: 'professionalPhoto',
        s3KeyField: 'docProfessionalPhotoKey',
        statusField: 'docProfessionalPhotoStatus',
        fileNameField: 'docProfessionalPhotoFileName',
        mimeField: 'docProfessionalPhotoMime'
      }
    ];

    const populated = await Promise.all(
      elements.map(async (doc) => {
        const plainDoc = { ...doc }; // ✅ spread into plain object first
        if (plainDoc.profileImage) {
          plainDoc.profileImage = await getPresignedS3Url(plainDoc.profileImage);
        }
        plainDoc.documents = plainDoc.documents || {};
        await Promise.all(
          documentKeyMap.map(async (d) => {
            const s3Key = plainDoc[d.s3KeyField];
            const url = s3Key ? await getPresignedS3Url(s3Key) : null;
            plainDoc.documents[d.key] = {
              key: s3Key || null,
              url,
              status: plainDoc[d.statusField] || 'PENDING',
              fileName: plainDoc[d.fileNameField] || null,
              mime: plainDoc[d.mimeField] || null
            };
          })
        );
        return plainDoc;
      })
    );

    return isArray ? populated : populated[0];
  }

  async _attachRatings(doctors) {
    if (!doctors || (Array.isArray(doctors) && doctors.length === 0)) return doctors;
    const isArray = Array.isArray(doctors);
    const doctorList = isArray ? doctors : [doctors];
    const doctorIds = doctorList.map((d) => d.id);

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';
    const internalSecret = process.env.INTERNAL_SERVICE_SECRET;

    try {
      const response = await axios.post(`${baseUrl}/consultations/doctors/rating/bulk`,
        { doctorIds },
        {
          headers: {
            'x-internal-secret': internalSecret,
            'Content-Type': 'application/json'
          }
        }
      );

      const ratingMap = response.data?.data || {};

      doctorList.forEach((doc) => {
        const ratingInfo = ratingMap[doc.id] || {
          averageRating: 0,
          totalReviews: 0,
          ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
        };
        doc.rating = {
          averageRating: ratingInfo.averageRating,
          totalReviews: ratingInfo.totalReviews,
          ratingBreakdown: ratingInfo.ratingBreakdown
        };
      });
    } catch (err) {
      console.error('[ProfileService] Failed to fetch bulk ratings:', err.message);
      // Fallback to zeros if rating service is down
      doctorList.forEach((doc) => {
        doc.rating = doc.rating || {
          averageRating: 0,
          totalReviews: 0,
          ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
        };
      });
    }

    return isArray ? doctorList : doctorList[0];
  }

  async _attachHospitalDetails(doctors) {
    if (!doctors || (Array.isArray(doctors) && doctors.length === 0)) return doctors;
    const isArray = Array.isArray(doctors);
    const doctorList = isArray ? doctors : [doctors];

    // Collect all unique hospital IDs
    const hospitalIds = new Set();
    doctorList.forEach((doc) => {
      if (doc.hospitalId) hospitalIds.add(doc.hospitalId);
      if (doc.assignedHospitalIds && Array.isArray(doc.assignedHospitalIds)) {
        doc.assignedHospitalIds.forEach((id) => hospitalIds.add(id));
      }
    });

    if (hospitalIds.size === 0) return doctors;

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';
    const internalSecret = process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123';

    try {
      const response = await axios.post(
        `${baseUrl}/super-admins/hospital/bulk`,
        { ids: Array.from(hospitalIds) },
        {
          headers: {
            'x-internal-service-key': internalSecret,
            'Content-Type': 'application/json'
          }
        }
      );

      const hospitalMap = response.data?.data || {};

      doctorList.forEach((doc) => {
        // Preference to primary hospitalId if available in map, else first assigned
        const hId = doc.hospitalId || (doc.assignedHospitalIds && doc.assignedHospitalIds[0]);
        if (hId && hospitalMap[hId]) {
          const h = hospitalMap[hId];
          doc.hospital = {
            id: hId,
            name: h.shortName || h.officialName || 'Hospital',
            officialName: h.officialName,
            shortName: h.shortName,
            address: h.fullAddress,
            location: h.area || h.emirate
          };
        }
      });
    } catch (err) {
      console.error('[ProfileService] Failed to fetch bulk hospitals:', err.message);
    }

    return isArray ? doctorList : doctorList[0];
  }

  async _fetchHospitalIdsByFilters(filters) {
    const { emirate, facility, distanceRange, lat, lng } = filters;
    if (!emirate && !facility && !distanceRange) return null;

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';
    const internalSecret = process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123';

    try {
      const response = await axios.get(`${baseUrl}/super-admins/hospital/search/ids`, {
        params: { emirate, facility, distanceRange, lat, lng },
        headers: {
          'x-internal-service-key': internalSecret
        }
      });
      return response.data?.data || [];
    } catch (err) {
      console.error('[ProfileService] Failed to fetch hospital IDs by filters:', err.message);
      return [];
    }
  }
}

module.exports = new DoctorService();
