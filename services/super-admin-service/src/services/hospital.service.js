import prisma from "../prisma/client.js";
import axios from "axios";
import s3Handler from "../utils/s3Handler.js";
import { publishAuditEvent, computeDiff } from "../utils/auditPublisher.js";

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
          status: data.status || "PENDING",
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

    // Publish Audit Event for Hospital Creation
    publishAuditEvent({
      hospitalId: hospital.id,
      actionPerformed: "Create",
      actionType: "WORKFLOW",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: null,
      newValue: hospital,
      statusChange: { from: null, to: hospital.status || "PENDING" },
      remarks: data.remarks || "Hospital created",
      path: `/hospital/${hospital.id}`,
      method: "POST",
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
      },
    });

    const map = {};
    hospitals.forEach((h) => {
      map[h.id] = h;
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

    const { remarks, ...updateData } = data;

    const hospital = await prisma.hospital.update({
      where: { id },
      data: updateData,
      include: {
        finance: true,
      },
    });

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

    return hospital;
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
      statusChange: { from: previous.status || null, to: "DELETED" },
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
      data: { status: "UNDER_REVIEW" },
    });

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

    return updated;
  }

  async approveHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { status: "APPROVED" },
    });

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

    return updated;
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
      data: { status: "REJECTED" },
    });

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

    return updated;
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
      data: { status: "SENT_BACK" },
    });

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

    return updated;
  }

  async resubmitHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { status: "PENDING" },
    });

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

    return updated;
  }

  async activateHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { status: "ACTIVE" },
    });

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

    return updated;
  }

  async deactivateHospital(id, { userContext = {}, remarks = null } = {}) {
    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: { status: "INACTIVE" },
    });

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

    return updated;
  }

  async adminOverrideHospital(id, { userContext = {}, remarks, payload = {} } = {}) {
    if (!remarks || !remarks.trim()) {
      const err = new Error("Remarks are required for admin override justification");
      err.statusCode = 400;
      throw err;
    }

    const previous = await this.getHospitalById(id);
    const updated = await prisma.hospital.update({
      where: { id },
      data: payload,
    });

    const diffResult = computeDiff(previous, updated);

    publishAuditEvent({
      hospitalId: id,
      actionPerformed: "Admin Override",
      actionType: "SYSTEM",
      performedByUserId: userContext.userId || "admin",
      performedByRole: userContext.role || "SUPER_ADMIN",
      previousValue: diffResult.previousValue || previous,
      newValue: diffResult.newValue || updated,
      statusChange: diffResult.statusChange,
      remarks,
      path: `/hospital/${id}/override`,
      method: "POST",
    });

    return updated;
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
      where.specializationsAvailable = { hasSome: specialtyList };
    }

    const statusList = parseList(status);
    if (statusList.length > 0) {
      where.status = { in: statusList.map((s) => s.toUpperCase()) };
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
        const [totalConsultations, doctors] = await Promise.all([
          fetchConsultationCount(hospital.id),
          fetchDoctorCount(hospital.id),
        ]);
        return { ...hospital, totalConsultations, doctors };
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

    for (const { field, keyCol } of singleFields) {
      if (files[field] && files[field].length > 0) {
        const file = files[field][0];
        const { key, url } = await s3Handler.uploadToS3(file);
        patch[field] = url;
        patch[keyCol] = key;
      }
    }

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

    return prisma.hospital.update({
      where: { id: hospitalId },
      data: patch,
      include: {
        finance: true,
      },
    });
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

    return prisma.hospital.update({
      where: { id: hospitalId },
      data: patch,
      include: { finance: true },
    });
  }

  async getHospitalIds(query) {
    const { lat, lng, distanceRange } = query;

    const hospitals = await prisma.hospital.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
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
    return 0;
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

export default new HospitalService();
