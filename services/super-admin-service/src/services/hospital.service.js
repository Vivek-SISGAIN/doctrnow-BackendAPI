import prisma from "../prisma/client.js";
import axios from "axios";
import s3Handler from "../utils/s3Handler.js";

class HospitalService {
  async createHospital(data) {
    const hospital = await prisma.hospital.create({
      data: {
        officialName: data.officialName,
        shortName: data.shortName,
        registrationNumber: data.registrationNumber,
        dhaLicenseNumber: data.dhaLicenseNumber,
        hospitalType: data.hospitalType,
        specializationFocus: data.specializationFocus,
        branchId: data.branchId,
        emirate: data.emirate,
        area: data.area,
        fullAddress: data.fullAddress,
        poBox: data.poBox,
        latitude: data.latitude,
        longitude: data.longitude,
        landline: data.landline,
        mobile: data.mobile,
        officialEmail: data.officialEmail,
        website: data.website,
        facebook: data.facebook,
        instagram: data.instagram,
        operations: data.operations,
        servicesOffered: data.servicesOffered || [],
        specializationsAvailable: data.specializationsAvailable || [],
      },
      include: {
        finance: true,
      },
    });

    return hospital;
  }

  async getHospitalById(id) {
    const hospital = await prisma.hospital.findUnique({
      where: { id },
      include: { finance: true },
    });

    if (!hospital) {
      throw new Error("Hospital not found");
    }

    return hospital;
  }

  async updateHospital(id, data) {
    const hospital = await prisma.hospital.update({
      where: { id },
      data,
      include: {
        finance: true,
      },
    });

    return hospital;
  }

  async deleteHospital(id) {
    await prisma.hospital.delete({
      where: { id },
    });

    return { message: "Hospital deleted successfully" };
  }

  async getHospitals(filters = {}, pagination = {}) {
    const {
      search,
      location,
      specialties, // comma-separated string or array
      status, // comma-separated string or array
      doctorMin,
      doctorMax,
      consultationMin,
      consultationMax,
    } = filters;

    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    // ── Build Prisma where clause ───────────────────────────────────────────
    const where = {};

    // Hospital name – partial / full match
    if (search) {
      where.OR = [
        { officialName: { contains: search, mode: "insensitive" } },
        { shortName: { contains: search, mode: "insensitive" } },
        { registrationNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    // Location – matches emirate, area, fullAddress, or branchId
    if (location) {
      const locConditions = [
        { emirate: { contains: location, mode: "insensitive" } },
        { area: { contains: location, mode: "insensitive" } },
        { fullAddress: { contains: location, mode: "insensitive" } },
        { branchId: { contains: location, mode: "insensitive" } },
      ];
      // Merge with existing OR or create a new AND block
      if (where.OR) {
        // Wrap into AND: (name matches) AND (location matches)
        where.AND = [{ OR: where.OR }, { OR: locConditions }];
        delete where.OR;
      } else {
        where.OR = locConditions;
      }
    }

    // Specialties – multi-select (array or comma-separated
    const specialtyList = parseList(specialties);
    if (specialtyList.length > 0) {
      where.specializationsAvailable = { hasSome: specialtyList };
    }

    // Status – multi-select
    const statusList = parseList(status);
    if (statusList.length > 0) {
      // Map to uppercase to match typical enum storage
      where.state = { in: statusList.map((s) => s.toUpperCase()) };
    }

    // ── Query DB ────────────────────────────────────────────────────────────
    const [hospitals, total] = await Promise.all([
      prisma.hospital.findMany({
        where,
        include: { finance: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.hospital.count({ where }),
    ]);

    // ── Enrich with external counts ─────────────────────────────────────────
    const enriched = await Promise.all(
      hospitals.map(async (hospital) => {
        const [totalConsultations, doctors] = await Promise.all([
          fetchConsultationCount(hospital.id),
          fetchDoctorCount(hospital.id),
        ]);
        return { ...hospital, totalConsultations, doctors };
      }),
    );

    // ── Post-enrichment filter: doctor / consultation count ranges ──────────
    const dMin = doctorMin !== undefined ? parseInt(doctorMin, 10) : null;
    const dMax = doctorMax !== undefined ? parseInt(doctorMax, 10) : null;
    const cMin =
      consultationMin !== undefined ? parseInt(consultationMin, 10) : null;
    const cMax =
      consultationMax !== undefined ? parseInt(consultationMax, 10) : null;

    const filtered = enriched.filter((h) => {
      if (dMin !== null && (h.doctors ?? 0) < dMin) return false;
      if (dMax !== null && (h.doctors ?? 0) > dMax) return false;
      if (cMin !== null && (h.totalConsultations ?? 0) < cMin) return false;
      if (cMax !== null && (h.totalConsultations ?? 0) > cMax) return false;
      return true;
    });

    return {
      hospitals: filtered,
      pagination: {
        total, // DB total (before count-range filter)
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Upload hospital compliance documents to S3 and persist URLs in the DB.
   * Allows saving any combination of documents at once.
   *
   * @param {string} hospitalId
   * @param {object} files  – req.files from multer .fields()
   */
  async uploadDocuments(hospitalId, files) {
    // 1. Verify hospital exists
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new Error("Hospital not found");

    const patch = {};

    // 2. Process Single Fields
    const singleFields = [
      { field: "tradeLicenseDocument", keyCol: "tradeLicenseDocumentKey" },
      { field: "dhaLicenseDocument", keyCol: "dhaLicenseDocumentKey" },
      { field: "establishmentCard", keyCol: "establishmentCardKey" },
    ];

    for (const { field, keyCol } of singleFields) {
      if (files[field] && files[field].length > 0) {
        // Just take the first/last one if it was provided
        const file = files[field][0];
        const { key, url } = await s3Handler.uploadToS3(file);
        patch[field] = url;
        patch[keyCol] = key;
      }
    }

    // 3. Process Array Fields
    const arrayFields = [
      { field: "insuranceDocuments", keyCol: "insuranceDocumentKeys" },
      {
        field: "accreditationCertificates",
        keyCol: "accreditationCertificateKeys",
      },
    ];

    for (const { field, keyCol } of arrayFields) {
      if (files[field] && files[field].length > 0) {
        const uploadedUrls = [];
        const uploadedKeys = [];

        for (const file of files[field]) {
          const { key, url } = await s3Handler.uploadToS3(file);
          uploadedUrls.push(url);
          uploadedKeys.push(key);
        }

        patch[field] = { push: uploadedUrls };
        patch[keyCol] = { push: uploadedKeys };
      }
    }

    if (Object.keys(patch).length === 0) {
      throw new Error("No valid files were provided for upload.");
    }

    // 4. Update the Hospital directly
    return prisma.hospital.update({
      where: { id: hospitalId },
      data: patch,
      include: {
        finance: true,
      },
    });
  }
}

async function fetchConsultationCount(hospitalId) {
  try {
    const { data } = await axios.get(
      `${process.env.API_GATEWAY}/appointments`,
      {
        params: { hospitalId },
      },
    );

    if (Array.isArray(data)) return data.length;
    if (typeof data?.total === "number") return data.total;
    if (Array.isArray(data?.data)) return data.data.length;
    return 0;
  } catch {
    return 0; // never let one failure break the whole list
  }
}

async function fetchDoctorCount(hospitalId) {
  try {
    const { data } = await axios.get(
      `${process.env.API_GATEWAY}/profiles/doctors/hospital/${hospitalId}?status=ACTIVE`,
    );
    if (Array.isArray(data)) return data.length;
    if (typeof data?.total === "number") return data.total;
    if (Array.isArray(data?.data)) return data.data.length;
    return 0;
  } catch (err) {
    console.log(
      err.response?.data ||
        err.message ||
        "Unknown error while fetching doctor count",
    );
    return 0;
  }
}

/**
 * Normalises a filter value that can be:
 *   - undefined / null          → []
 *   - a comma-separated string  → ["Cardiology","Neurology"]
 *   - already an array          → returned as-is (trimmed)
 */
function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default new HospitalService();
