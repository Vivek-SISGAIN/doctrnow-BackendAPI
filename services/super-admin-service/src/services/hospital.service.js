import prisma from "../prisma/client.js";
import axios from "axios";
import s3Handler from "../utils/s3Handler.js";
import { publishAuditEvent, computeDiff } from "../utils/auditPublisher.js";

const formatHospital = (h) => {
  if (!h) return h;
  return {
    ...h,
    status: h.state || h.status || "PENDING",
  };
};

const populateHospitalListingUrls = async (h) => {
  if (!h) return h;

  try {
    const [logoPresignedUrl, bannerPresignedUrl] = await Promise.all([
      (h.logoKey || h.logoUrl || h.logo) ? s3Handler.getPresignedS3Url(h.logoKey || h.logoUrl || h.logo) : null,
      (h.bannerKey || h.bannerUrl || h.banner) ? s3Handler.getPresignedS3Url(h.bannerKey || h.bannerUrl || h.banner) : null,
    ]);

    return {
      ...formatHospital(h),
      logoUrl: logoPresignedUrl || h.logoUrl || h.logo,
      bannerUrl: bannerPresignedUrl || h.bannerUrl || h.banner,
    };
  } catch (err) {
    return formatHospital(h);
  }
};

const populateHospitalPresignedUrls = async (h) => {
  if (!h) return h;

  try {
    const [
      tradeLicenseDownloadUrl,
      dhaLicenseDownloadUrl,
      establishmentCardDownloadUrl,
      logoPresignedUrl,
      bannerPresignedUrl,
    ] = await Promise.all([
      s3Handler.getPresignedS3Url(h.tradeLicenseDocumentKey || h.tradeLicenseDocument),
      s3Handler.getPresignedS3Url(h.dhaLicenseDocumentKey || h.dhaLicenseDocument),
      s3Handler.getPresignedS3Url(h.establishmentCardKey || h.establishmentCard),
      s3Handler.getPresignedS3Url(h.logoKey || h.logoUrl || h.logo),
      s3Handler.getPresignedS3Url(h.bannerKey || h.bannerUrl || h.banner),
    ]);

    // Insurance documents
    const insuranceDocs = Array.isArray(h.insuranceDocuments) ? h.insuranceDocuments : [];
    const insuranceKeys = Array.isArray(h.insuranceDocumentKeys) ? h.insuranceDocumentKeys : [];
    const maxInsuranceLen = Math.max(insuranceDocs.length, insuranceKeys.length);
    const insuranceDocumentsWithDownload = await Promise.all(
      Array.from({ length: maxInsuranceLen }).map(async (_, idx) => {
        const keyOrUrl = insuranceKeys[idx] || insuranceDocs[idx];
        const origUrl = insuranceDocs[idx] || keyOrUrl;
        const downloadUrl = await s3Handler.getPresignedS3Url(keyOrUrl);
        return { url: origUrl, downloadUrl: downloadUrl || origUrl };
      })
    );

    // Accreditation certificates
    const accreditationDocs = Array.isArray(h.accreditationCertificates) ? h.accreditationCertificates : [];
    const accreditationKeys = Array.isArray(h.accreditationCertificateKeys) ? h.accreditationCertificateKeys : [];
    const maxAccreditationLen = Math.max(accreditationDocs.length, accreditationKeys.length);
    const accreditationCertificatesWithDownload = await Promise.all(
      Array.from({ length: maxAccreditationLen }).map(async (_, idx) => {
        const keyOrUrl = accreditationKeys[idx] || accreditationDocs[idx];
        const origUrl = accreditationDocs[idx] || keyOrUrl;
        const downloadUrl = await s3Handler.getPresignedS3Url(keyOrUrl);
        return { url: origUrl, downloadUrl: downloadUrl || origUrl };
      })
    );

    return {
      ...formatHospital(h),
      tradeLicenseDownloadUrl: tradeLicenseDownloadUrl || h.tradeLicenseDocument,
      dhaLicenseDownloadUrl: dhaLicenseDownloadUrl || h.dhaLicenseDocument,
      establishmentCardDownloadUrl: establishmentCardDownloadUrl || h.establishmentCard,
      logoUrl: logoPresignedUrl || h.logoUrl || h.logo,
      bannerUrl: bannerPresignedUrl || h.bannerUrl || h.banner,
      insuranceDocumentsWithDownload,
      accreditationCertificatesWithDownload,
    };
  } catch (err) {
    console.error("Error populating presigned URLs for hospital:", err);
    return formatHospital(h);
  }
};

class HospitalService {
  async createHospital(data, userContext = {}) {
    const parentHospitalId = data.parentHospitalId || null;

    const hospital = await prisma.$transaction(async (tx) => {
      const created = await tx.hospital.create({
        data: {
          officialName: data.officialName,
          shortName: data.shortName,
          registrationNumber: data.registrationNumber,
          dhaLicenseNumber: data.dhaLicenseNumber,
          hospitalType: data.hospitalType,
          specializationFocus: data.specializationFocus,
          parentHospitalId,
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
          state: data.state || data.status || "PENDING",
        },
        include: {
          finance: true,
        },
      });

      if (parentHospitalId) {
        await tx.hospital.update({
          where: { id: parentHospitalId },
          data: {
            branchIds: { push: created.id },
          },
        });
      }

      return created;
    });

    const formatted = await populateHospitalPresignedUrls(hospital);

    // Publish Audit Event for Hospital Creation
    publishAuditEvent({
      hospitalId: hospital.id,
      actionPerformed: "Create",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: null,
      newValue: formatted,
      statusChange: { from: null, to: formatted.status },
      remarks: data.remarks || "Hospital created",
      path: `/hospital/${hospital.id}`,
      method: "POST",
    });

    return formatted;
  }

  async getHospitalById(id) {
    const hospital = await prisma.hospital.findUnique({
      where: { id },
      include: { finance: true },
    });

    if (!hospital) {
      throw new Error("Hospital not found");
    }

    return await populateHospitalPresignedUrls(hospital);
  }

  async getHospitalByIds(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return {};

    const hospitals = await prisma.hospital.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        officialName: true,
        shortName: true,
        hospitalType: true,
        emirate: true,
        area: true,
        fullAddress: true,
        state: true,
      },
    });

    const map = {};
    hospitals.forEach((h) => {
      map[h.id] = formatHospital(h);
    });
    return map;
  }

  async updateHospital(id, data, userContext = {}) {
    const previous = await prisma.hospital.findUnique({
      where: { id },
      include: { finance: true },
    });

    if (!previous) {
      throw new Error("Hospital not found");
    }

    const { remarks, status, state, ...updateData } = data;
    const resolvedState = state || status;
    if (resolvedState !== undefined) {
      updateData.state = resolvedState;
    }

    const hospital = await prisma.hospital.update({
      where: { id },
      data: updateData,
      include: {
        finance: true,
      },
    });

    const formatted = await populateHospitalPresignedUrls(hospital);
    const diffResult = computeDiff(previous, hospital);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Edit",
      actionType: "DATA_CHANGE",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: diffResult.previousValue,
      newValue: diffResult.newValue,
      statusChange: diffResult.statusChange,
      remarks: remarks || "Hospital details updated",
      path: `/hospital/${id}`,
      method: "PATCH",
    });

    return formatted;
  }

  async deleteHospital(id, userContext = {}) {
    const previous = await prisma.hospital.findUnique({
      where: { id },
    });

    if (!previous) {
      throw new Error("Hospital not found");
    }

    await prisma.hospital.delete({
      where: { id },
    });

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Delete",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: previous,
      newValue: null,
      statusChange: { from: previous.state || previous.status || null, to: "DELETED" },
      remarks: userContext.remarks || "Hospital deleted",
      path: `/hospital/${id}`,
      method: "DELETE",
    });

    return { message: "Hospital deleted successfully" };
  }

  // ─── Lifecycle Workflow Methods ──────────────────────────────────────────

  async submitForApproval(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { state: "UNDER_REVIEW" },
    });

    const formatted = formatHospital(updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Submit for Approval",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "HOSPITAL_ADMIN",
      previousValue: { status: previous.status },
      newValue: { status: "UNDER_REVIEW" },
      statusChange: { from: previous.status, to: "UNDER_REVIEW" },
      remarks: remarks || "Submitted for compliance review and approval",
      path: `/hospital/${id}/submit-for-approval`,
      method: "POST",
    });

    return formatted;
  }

  async approveHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { state: "APPROVED" },
    });

    const formatted = formatHospital(updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Approve",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: { status: previous.status },
      newValue: { status: "APPROVED" },
      statusChange: { from: previous.status, to: "APPROVED" },
      remarks: remarks || "Hospital application approved",
      path: `/hospital/${id}/approve`,
      method: "POST",
    });

    return formatted;
  }

  async rejectHospital(id, { userContext = {}, remarks } = {}) {
    if (!remarks || !remarks.trim()) {
      const err = new Error("Remarks are required for rejecting a hospital");
      err.statusCode = 400;
      throw err;
    }

    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { state: "REJECTED" },
    });

    const formatted = formatHospital(updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Reject",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: { status: previous.status },
      newValue: { status: "REJECTED" },
      statusChange: { from: previous.status, to: "REJECTED" },
      remarks,
      path: `/hospital/${id}/reject`,
      method: "POST",
    });

    return formatted;
  }

  async sendBackHospital(id, { userContext = {}, remarks } = {}) {
    if (!remarks || !remarks.trim()) {
      const err = new Error("Remarks are required for sending back for correction");
      err.statusCode = 400;
      throw err;
    }

    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { state: "SENT_BACK" },
    });

    const formatted = formatHospital(updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Send Back",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: { status: previous.status },
      newValue: { status: "SENT_BACK" },
      statusChange: { from: previous.status, to: "SENT_BACK" },
      remarks,
      path: `/hospital/${id}/send-back`,
      method: "POST",
    });

    return formatted;
  }

  async resubmitHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { state: "PENDING" },
    });

    const formatted = formatHospital(updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Resubmit",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "HOSPITAL_ADMIN",
      previousValue: { status: previous.status },
      newValue: { status: "PENDING" },
      statusChange: { from: previous.status, to: "PENDING" },
      remarks: remarks || "Resubmitted with updated corrections",
      path: `/hospital/${id}/resubmit`,
      method: "POST",
    });

    return formatted;
  }

  async activateHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { state: "ACTIVE" },
    });

    const formatted = formatHospital(updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Activate",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: { status: previous.status },
      newValue: { status: "ACTIVE" },
      statusChange: { from: previous.status, to: "ACTIVE" },
      remarks: remarks || "Hospital activated",
      path: `/hospital/${id}/activate`,
      method: "POST",
    });

    return formatted;
  }

  async deactivateHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { state: "INACTIVE" },
    });

    const formatted = formatHospital(updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Deactivate",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: { status: previous.status },
      newValue: { status: "INACTIVE" },
      statusChange: { from: previous.status, to: "INACTIVE" },
      remarks: remarks || "Hospital deactivated",
      path: `/hospital/${id}/deactivate`,
      method: "POST",
    });

    return formatted;
  }

  async adminOverrideHospital(id, { userContext = {}, remarks, payload = {} } = {}) {
    if (!remarks || !remarks.trim()) {
      const err = new Error("Remarks are required for admin override justification");
      err.statusCode = 400;
      throw err;
    }

    const previous = await this.getHospitalById(id);
    const sanitizedPayload = { ...payload };
    if (sanitizedPayload.status !== undefined && sanitizedPayload.state === undefined) {
      sanitizedPayload.state = sanitizedPayload.status;
      delete sanitizedPayload.status;
    } else if (sanitizedPayload.status !== undefined) {
      delete sanitizedPayload.status;
    }

    const updated = await prisma.hospital.update({
      where: { id },
      data: sanitizedPayload,
    });

    const formatted = formatHospital(updated);
    const diffResult = computeDiff(previous, updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Admin Override",
      actionType: "SYSTEM",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: diffResult.previousValue || previous,
      newValue: diffResult.newValue || formatted,
      statusChange: diffResult.statusChange,
      remarks,
      path: `/hospital/${id}/override`,
      method: "POST",
    });

    return formatted;
  }

  // ─── Query & Documents Methods ───────────────────────────────────────────

  async getHospitals(filters = {}, pagination = {}) {
    const {
      search,
      location,
      specialties,
      status,
      doctorMin,
      doctorMax,
      consultationMin,
      consultationMax,
    } = filters;

    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = {};

    if (search) {
      where.OR = [
        { officialName: { contains: search, mode: "insensitive" } },
        { shortName: { contains: search, mode: "insensitive" } },
        { registrationNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    if (location) {
      const locConditions = [
        { emirate: { contains: location, mode: "insensitive" } },
        { area: { contains: location, mode: "insensitive" } },
        { fullAddress: { contains: location, mode: "insensitive" } },
        { branchId: { contains: location, mode: "insensitive" } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: locConditions }];
        delete where.OR;
      } else {
        where.OR = locConditions;
      }
    }

    const specialtyList = parseList(specialties);
    if (specialtyList.length > 0) {
      const searchTerms = expandSpecialtyTerms(specialtyList);
      where.specializationsAvailable = { hasSome: searchTerms };
    }

    const statusList = parseList(status);
    if (statusList.length > 0) {
      where.state = { in: statusList.map((s) => s.toUpperCase()) };
    }

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

    const enriched = await Promise.all(
      hospitals.map(async (hospital) => {
        const [totalConsultations, docMetrics] = await Promise.all([
          fetchConsultationCount(hospital.id),
          fetchHospitalDoctorMetrics(hospital.id),
        ]);
        return await populateHospitalListingUrls({
          ...hospital,
          totalConsultations,
          doctors: docMetrics.doctors,
          rating: docMetrics.rating,
          totalReviews: docMetrics.totalReviews,
          nextAvailableSlot: docMetrics.nextAvailableSlot,
        });
      }),
    );

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
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async uploadDocuments(hospitalId, files) {
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new Error("Hospital not found");

    const patch = {};

    const singleFields = [
      { field: "tradeLicenseDocument", keyCol: "tradeLicenseDocumentKey" },
      { field: "dhaLicenseDocument", keyCol: "dhaLicenseDocumentKey" },
      { field: "establishmentCard", keyCol: "establishmentCardKey" },
    ];

    await Promise.all(
      singleFields.map(async ({ field, keyCol }) => {
        if (files[field] && files[field].length > 0) {
          const file = files[field][0];
          const { key, url } = await s3Handler.uploadToS3(file);
          patch[field] = url;
          patch[keyCol] = key;
        }
      })
    );

    const arrayFields = [
      { field: "insuranceDocuments", keyCol: "insuranceDocumentKeys" },
      {
        field: "accreditationCertificates",
        keyCol: "accreditationCertificateKeys",
      },
    ];

    await Promise.all(
      arrayFields.map(async ({ field, keyCol }) => {
        if (files[field] && files[field].length > 0) {
          const uploadResults = await Promise.all(
            files[field].map((file) => s3Handler.uploadToS3(file))
          );
          patch[field] = { push: uploadResults.map((r) => r.url) };
          patch[keyCol] = { push: uploadResults.map((r) => r.key) };
        }
      })
    );

    if (Object.keys(patch).length === 0) {
      throw new Error("No valid files were provided for upload.");
    }

    const result = await prisma.hospital.update({
      where: { id: hospitalId },
      data: patch,
      include: {
        finance: true,
      },
    });

    return await populateHospitalPresignedUrls(result);
  }

  async uploadBranding(hospitalId, files = {}, primaryColor, secondaryColor) {
    const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital) throw new Error("Hospital not found");

    const patch = {};

    if (files.logo && files.logo.length > 0) {
      const { key, url } = await s3Handler.uploadToS3(files.logo[0], "branding/logos");
      patch.logoKey = key;
      patch.logoUrl = url;
    }

    if (files.banner && files.banner.length > 0) {
      const { key, url } = await s3Handler.uploadToS3(files.banner[0], "branding/banners");
      patch.bannerKey = key;
      patch.bannerUrl = url;
    }

    if (primaryColor) patch.primaryColor = primaryColor;
    if (secondaryColor) patch.secondaryColor = secondaryColor;

    if (Object.keys(patch).length === 0) {
      throw new Error("No branding files or colors provided.");
    }

    const result = await prisma.hospital.update({
      where: { id: hospitalId },
      data: patch,
      include: { finance: true },
    });

    return await populateHospitalPresignedUrls(result);
  }

  async getHospitalIds(query) {
    const { lat, lng, distanceRange, emirate, emirates, facility } = query;

    const where = {};

    const effectiveEmirates = emirate || emirates;
    if (effectiveEmirates) {
      const emiratesList = Array.isArray(effectiveEmirates)
        ? effectiveEmirates
        : typeof effectiveEmirates === "string"
        ? effectiveEmirates.split(",").map((e) => e.trim())
        : [effectiveEmirates];

      where.OR = emiratesList.map((em) => ({
        emirate: { equals: em, mode: "insensitive" }
      }));
    }

    if (facility) {
      where.hospitalType = { contains: facility, mode: "insensitive" };
    }

    const hospitals = await prisma.hospital.findMany({
      where,
      select: {
        id: true,
        latitude: true,
        longitude: true,
        emirate: true,
      },
    });

    if (distanceRange && lat && lng) {
      const R = 6371;
      const centerLat = parseFloat(lat);
      const centerLng = parseFloat(lng);
      const range = parseFloat(distanceRange);

      return hospitals
        .filter((h) => {
          if (h.latitude === null || h.longitude === null) return false;
          const dLat = ((h.latitude - centerLat) * Math.PI) / 180;
          const dLon = ((h.longitude - centerLng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((centerLat * Math.PI) / 180) *
              Math.cos((h.latitude * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const d = R * c;
          return d <= range;
        })
        .map((h) => h.id);
    }

    return hospitals.map((h) => h.id);
  }
}

async function fetchConsultationCount(hospitalId) {
  try {
    const { data } = await axios.get(
      `${process.env.API_GATEWAY}/appointments`,
      {
        params: { hospitalId },
        headers: {
          "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET || "super_secret_internal_key_123",
        },
        timeout: 3000,
      },
    );

    if (Array.isArray(data)) return data.length;
    if (typeof data?.total === "number") return data.total;
    if (Array.isArray(data?.data)) return data.data.length;
    return 0;
  } catch {
    return 0;
  }
}

function formatTime12h(time24) {
  if (!time24) return "";
  const parts = time24.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || 0, 10);
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function getNextSlotFromDoctorSchedule(schedule) {
  if (!schedule || typeof schedule !== "object" || Object.keys(schedule).length === 0) {
    return null;
  }

  const normalized = {};
  for (const [day, config] of Object.entries(schedule)) {
    if (config && typeof config === "object") {
      const dayUpper = day.toUpperCase();
      if (Array.isArray(config.slots) && config.enabled && config.slots.length > 0) {
        normalized[dayUpper] = config.slots.map((sl) => ({ from: sl.startTime, to: sl.endTime }));
      } else if (config.from && config.to) {
        normalized[dayUpper] = [{ from: config.from, to: config.to }];
      }
    }
  }

  const now = new Date();
  const dubaiNowStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  const [datePart, timePart] = dubaiNowStr.split(", ");
  const [y, m, d] = datePart.split("-").map(Number);
  const [currH, currM] = timePart.split(":").map(Number);
  const dubaiNowMinutes = currH * 60 + currM;

  const dayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const currentDubaiWeekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Dubai",
  }).format(now).toUpperCase();

  const startDayIdx = dayNames.indexOf(currentDubaiWeekday);

  for (let i = 0; i < 14; i++) {
    const currentIdx = (startDayIdx + i) % 7;
    const dayName = dayNames[currentIdx];
    const slots = normalized[dayName];

    if (!slots || slots.length === 0) continue;

    for (const slot of slots) {
      const [fromH, fromM] = slot.from.split(":").map(Number);
      const [toH, toM] = slot.to.split(":").map(Number);
      const endMinutes = toH * 60 + toM;

      if (i === 0 && dubaiNowMinutes >= endMinutes) {
        continue;
      }

      const targetDate = new Date(y, m - 1, d + i, fromH, fromM);
      const dayStr = targetDate.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" });
      let label = `Next Available ${dayStr}`;
      if (i === 0) {
        label = "Next Available Today";
      } else if (i === 1) {
        label = "Next Available Tomorrow";
      }

      return {
        timestamp: targetDate.getTime(),
        time: formatTime12h(slot.from),
        label,
      };
    }
  }

  return null;
}

async function fetchHospitalDoctorMetrics(hospitalId) {
  try {
    const { data } = await axios.get(
      `${process.env.API_GATEWAY}/profiles/doctors/hospital/${hospitalId}?status=ACTIVE`,
      {
        headers: {
          "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET || "super_secret_internal_key_123",
        },
        timeout: 4000,
      }
    );

    const doctors = Array.isArray(data) ? data : data?.data || [];
    const doctorCount = doctors.length;

    if (doctorCount === 0) {
      return {
        doctors: 0,
        rating: 0,
        totalReviews: 0,
        nextAvailableSlot: {
          status: "NO_DOCTORS",
          label: "No doctors available",
          time: "",
        },
      };
    }

    let totalWeightedRating = 0;
    let totalReviews = 0;
    let docsWithRating = 0;
    let sumRating = 0;

    let earliestTimestamp = Infinity;
    let earliestSlot = null;
    const now = new Date();

    for (const doc of doctors) {
      const avg = doc.rating?.averageRating;
      const rev = doc.rating?.totalReviews;

      if (typeof avg === "number" && avg > 0) {
        docsWithRating++;
        sumRating += avg;
        if (typeof rev === "number" && rev > 0) {
          totalWeightedRating += avg * rev;
          totalReviews += rev;
        }
      }

      if (doc.nextAvailableSlot && doc.nextAvailableSlot.startTime) {
        const slotDate = new Date(doc.nextAvailableSlot.startTime);
        const t = slotDate.getTime();
        if (!isNaN(t) && t >= now.getTime() && t < earliestTimestamp) {
          earliestTimestamp = t;
          const isToday = slotDate.toDateString() === now.toDateString();
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const isTomorrow = slotDate.toDateString() === tomorrow.toDateString();

          let label = `Next Available ${slotDate.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" })}`;
          if (isToday) label = "Next Available Today";
          else if (isTomorrow) label = "Next Available Tomorrow";

          const timeStr = slotDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
          earliestSlot = { status: "AVAILABLE", label, time: timeStr };
        }
      }

      if (doc.schedule) {
        const schedSlot = getNextSlotFromDoctorSchedule(doc.schedule);
        if (schedSlot && schedSlot.timestamp >= now.getTime() && schedSlot.timestamp < earliestTimestamp) {
          earliestTimestamp = schedSlot.timestamp;
          earliestSlot = { status: "AVAILABLE", label: schedSlot.label, time: schedSlot.time };
        }
      }
    }

    let finalRating = 0;
    if (totalReviews > 0) {
      finalRating = parseFloat((totalWeightedRating / totalReviews).toFixed(1));
    } else if (docsWithRating > 0) {
      finalRating = parseFloat((sumRating / docsWithRating).toFixed(1));
    }

    return {
      doctors: doctorCount,
      rating: finalRating,
      totalReviews,
      nextAvailableSlot: earliestSlot || {
        status: "NO_SLOTS",
        label: "No slots available",
        time: "",
      },
    };
  } catch (err) {
    return {
      doctors: 0,
      rating: 0,
      totalReviews: 0,
      nextAvailableSlot: {
        status: "NO_DOCTORS",
        label: "No doctors available",
        time: "",
      },
    };
  }
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function expandSpecialtyTerms(specialtyList) {
  const variations = [];
  for (const spec of specialtyList) {
    if (!spec) continue;
    variations.push(spec);
    const clean = spec.replace(/\s+/g, "");
    variations.push(clean);

    if (/general\s*(physician|medicine|practitioner|practice)/i.test(spec)) {
      variations.push(
        "General Physician",
        "GeneralPhysician",
        "General Medicine",
        "GeneralMedicine",
        "General Practitioner",
        "GeneralPractitioner",
        "Internal Medicine",
        "InternalMedicine",
        "General Practice"
      );
    }
    if (/cardio/i.test(spec)) {
      variations.push("Cardiology", "Cardiologist", "Cardiovascular", "Cardio");
    }
    if (/derma/i.test(spec)) {
      variations.push("Dermatology", "Dermatologist", "Derma");
    }
    if (/ortho/i.test(spec)) {
      variations.push("Orthopedics", "Orthopaedics", "Orthopedic", "Orthopaedic", "Ortho");
    }
    if (/pedia/i.test(spec)) {
      variations.push("Pediatrics", "Paediatrics", "Pediatrician", "Paediatrician", "Pedia");
    }
    if (/neuro/i.test(spec)) {
      variations.push("Neurology", "Neurologist", "Neurosurgery", "Neuro");
    }
    if (/ent|ear\s*nose/i.test(spec)) {
      variations.push("ENT", "Otolaryngology", "Ear Nose Throat");
    }
    if (/ophthal|eye/i.test(spec)) {
      variations.push("Ophthalmology", "Ophthalmologist", "Eye");
    }
    if (/psych/i.test(spec)) {
      variations.push("Psychiatry", "Psychology", "Psychiatrist");
    }
    if (/gyn|obs/i.test(spec)) {
      variations.push("Gynecology", "Gynaecology", "Obstetrics");
    }
    if (/nephro/i.test(spec)) {
      variations.push("Nephrology", "Nephrologist");
    }
    if (/onco/i.test(spec)) {
      variations.push("Oncology", "Oncologist");
    }
  }
  return [...new Set(variations)];
}

export default new HospitalService();
