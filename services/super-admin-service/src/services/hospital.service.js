import prisma from "../prisma/client.js";
import axios from "axios";
import s3Handler from "../utils/s3Handler.js";
import { publishAuditEvent, computeDiff } from "../utils/auditPublisher.js";

const formatHospital = (h) => {
  if (!h) return h;

  let is24x7 = false;
  let operatingHours = null;

  if (typeof h.operations === "string") {
    const trimmed = h.operations.trim().toLowerCase();
    if (
      trimmed === "24x7" ||
      trimmed === "24/7" ||
      trimmed === "24*7" ||
      trimmed === "24hours"
    ) {
      is24x7 = true;
    } else {
      try {
        operatingHours = JSON.parse(h.operations);
      } catch {
        operatingHours = h.operations;
      }
    }
  } else if (h.operations && typeof h.operations === "object") {
    operatingHours = h.operations;
  }

  return {
    ...h,
    status: h.state || h.status || "PENDING",
    is24x7,
    operatingHours,
  };
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
      emirate,
      emirates,
      area,
      hospitalType,
      type,
      hospitalTypes,
      specializationFocus,
      specialties,
      specialization,
      specializations,
      specializationsAvailable,
      services,
      servicesOffered,
      service,
      status,
      state,
      statuses,
      isBranch,
      parentHospitalId,
      branchId,
      operations,
      is24x7,
      include24x7,
      doctorMin,
      doctorMax,
      consultationMin,
      consultationMax,
      startDate,
      endDate,
      fromDate,
      toDate,
      from,
      to,
      dateFrom,
      dateTo,
      dateField,
    } = filters;

    const page = parseInt(pagination.page, 10) || 1;
    const limit = parseInt(pagination.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const where = {};

    // 1. Search filter across text fields
    if (search && String(search).trim()) {
      const s = String(search).trim();
      addOrCondition(where, [
        { officialName: { contains: s, mode: "insensitive" } },
        { shortName: { contains: s, mode: "insensitive" } },
        { registrationNumber: { contains: s, mode: "insensitive" } },
        { dhaLicenseNumber: { contains: s, mode: "insensitive" } },
        { officialEmail: { contains: s, mode: "insensitive" } },
        { mobile: { contains: s, mode: "insensitive" } },
      ]);
    }

    // 2. Location / Emirate / Area
    const effectiveEmirates = emirate || emirates;
    const emirateList = parseList(effectiveEmirates);
    if (emirateList.length > 0) {
      if (emirateList.length === 1) {
        where.emirate = { equals: emirateList[0], mode: "insensitive" };
      } else {
        addOrCondition(
          where,
          emirateList.map((em) => ({
            emirate: { equals: em, mode: "insensitive" },
          }))
        );
      }
    }

    if (area && String(area).trim()) {
      where.area = { contains: String(area).trim(), mode: "insensitive" };
    }

    if (location && String(location).trim()) {
      const loc = String(location).trim();
      addOrCondition(where, [
        { emirate: { contains: loc, mode: "insensitive" } },
        { area: { contains: loc, mode: "insensitive" } },
        { fullAddress: { contains: loc, mode: "insensitive" } },
        { branchId: { contains: loc, mode: "insensitive" } },
      ]);
    }

    // 3. Hospital Type / Types
    const effectiveTypes = hospitalType || type || hospitalTypes;
    const typeList = parseList(effectiveTypes);
    if (typeList.length > 0) {
      if (typeList.length === 1) {
        where.hospitalType = { equals: typeList[0], mode: "insensitive" };
      } else {
        where.hospitalType = { in: typeList };
      }
    }

    // 4. Specialization Focus
    if (specializationFocus && String(specializationFocus).trim()) {
      where.specializationFocus = {
        contains: String(specializationFocus).trim(),
        mode: "insensitive",
      };
    }

    // 5. Specialties / Specializations Available (with case variants)
    const effectiveSpecialties =
      specialties ||
      specialization ||
      specializations ||
      specializationsAvailable;
    const specialtyList = parseList(effectiveSpecialties);
    if (specialtyList.length > 0) {
      const specialtyVariants = [];
      specialtyList.forEach((s) => {
        const trimmed = s.trim();
        if (trimmed) {
          specialtyVariants.push(trimmed);
          specialtyVariants.push(trimmed.toLowerCase());
          specialtyVariants.push(trimmed.toUpperCase());
          specialtyVariants.push(
            trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
          );
        }
      });
      where.specializationsAvailable = {
        hasSome: [...new Set(specialtyVariants)],
      };
    }

    // 6. Services Offered (with case variants)
    const effectiveServices = services || servicesOffered || service;
    const servicesList = parseList(effectiveServices);
    if (servicesList.length > 0) {
      const serviceVariants = [];
      servicesList.forEach((s) => {
        const trimmed = s.trim();
        if (trimmed) {
          serviceVariants.push(trimmed);
          serviceVariants.push(trimmed.toLowerCase());
          serviceVariants.push(trimmed.toUpperCase());
          serviceVariants.push(
            trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
          );
        }
      });
      where.servicesOffered = { hasSome: [...new Set(serviceVariants)] };
    }

    // 7. Status / State
    const effectiveStatus = status || state || statuses;
    const statusList = parseList(effectiveStatus);
    if (statusList.length > 0) {
      where.state = { in: statusList.map((s) => s.toUpperCase()) };
    }

    // 8. Branch relationship
    if (isBranch !== undefined && isBranch !== null && isBranch !== "") {
      const isBranchBool = String(isBranch).toLowerCase() === "true";
      if (isBranchBool) {
        where.parentHospitalId = { not: null };
      } else {
        where.parentHospitalId = null;
      }
    }
    if (parentHospitalId) {
      where.parentHospitalId = parentHospitalId;
    }
    if (branchId && String(branchId).trim()) {
      where.branchId = {
        contains: String(branchId).trim(),
        mode: "insensitive",
      };
    }

    // 9. Operations / 24x7
    const effective24x7 =
      is24x7 !== undefined && is24x7 !== null && is24x7 !== ""
        ? String(is24x7).toLowerCase() === "true"
        : operations &&
          ["24x7", "24/7"].includes(String(operations).trim().toLowerCase())
        ? true
        : null;

    if (effective24x7 === true) {
      addOrCondition(where, [
        { operations: { equals: "24x7", mode: "insensitive" } },
        { operations: { equals: "24/7", mode: "insensitive" } },
        { operations: { contains: "24x7", mode: "insensitive" } },
      ]);
    } else if (effective24x7 === false) {
      where.NOT = (where.NOT || []).concat([
        { operations: { equals: "24x7", mode: "insensitive" } },
        { operations: { equals: "24/7", mode: "insensitive" } },
      ]);
    } else if (operations && String(operations).trim()) {
      where.operations = {
        contains: String(operations).trim(),
        mode: "insensitive",
      };
    }

    // 10. Date Range Filtering (Explicit DB Date field vs Operational / Availability Date)
    const effectiveStartDate =
      startDate || fromDate || from || dateFrom;
    const effectiveEndDate = endDate || toDate || to || dateTo;
    const isExplicitDbDateField =
      dateField && ["createdAt", "updatedAt"].includes(dateField);

    if (effectiveStartDate || effectiveEndDate) {
      if (isExplicitDbDateField) {
        const dateCondition = {};

        if (effectiveStartDate) {
          const start = new Date(effectiveStartDate);
          if (!isNaN(start.getTime())) {
            dateCondition.gte = start;
          }
        }

        if (effectiveEndDate) {
          let end = new Date(effectiveEndDate);
          if (!isNaN(end.getTime())) {
            if (
              typeof effectiveEndDate === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(effectiveEndDate.trim())
            ) {
              end = new Date(`${effectiveEndDate.trim()}T23:59:59.999Z`);
            }
            dateCondition.lte = end;
          }
        }

        if (
          include24x7 === true ||
          String(include24x7).toLowerCase() === "true"
        ) {
          addOrCondition(where, [
            { [dateField]: dateCondition },
            { operations: { equals: "24x7", mode: "insensitive" } },
            { operations: { equals: "24/7", mode: "insensitive" } },
          ]);
        } else {
          where[dateField] = dateCondition;
        }
      } else {
        // Operational Date Range Filter:
        // 24x7 hospitals ALWAYS operate across any date range.
        // Also match hospitals with operating schedules on the days of the week in this date range.
        const days = getDaysInRange(effectiveStartDate, effectiveEndDate);
        const opConditions = [
          { operations: { equals: "24x7", mode: "insensitive" } },
          { operations: { equals: "24/7", mode: "insensitive" } },
          { operations: { contains: "24x7", mode: "insensitive" } },
          ...days.map((d) => ({
            operations: { contains: `"${d}"`, mode: "insensitive" },
          })),
        ];

        addOrCondition(where, opConditions);
      }
    }

    // 11. Sorting
    const sortFieldMap = {
      name: "officialName",
      officialName: "officialName",
      shortName: "shortName",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
      emirate: "emirate",
      hospitalType: "hospitalType",
      state: "state",
      status: "state",
    };
    const rawSortBy = (pagination.sortBy || "createdAt").trim();
    const sortField = sortFieldMap[rawSortBy] || "createdAt";
    const rawSortOrder = (
      pagination.sortOrder ||
      pagination.order ||
      "desc"
    ).toLowerCase();
    const sortOrder = rawSortOrder === "asc" ? "asc" : "desc";
    const orderBy = { [sortField]: sortOrder };

    const [hospitals, total] = await Promise.all([
      prisma.hospital.findMany({
        where,
        include: { finance: true },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.hospital.count({ where }),
    ]);

    const enriched = await Promise.all(
      hospitals.map(async (hospital) => {
        const [totalConsultations, doctors] = await Promise.all([
          fetchConsultationCount(hospital.id),
          fetchDoctorCount(hospital.id),
        ]);
        return formatHospital({ ...hospital, totalConsultations, doctors });
      }),
    );

    const dMin =
      doctorMin !== undefined && doctorMin !== "" && !isNaN(Number(doctorMin))
        ? parseInt(doctorMin, 10)
        : null;
    const dMax =
      doctorMax !== undefined && doctorMax !== "" && !isNaN(Number(doctorMax))
        ? parseInt(doctorMax, 10)
        : null;
    const cMin =
      consultationMin !== undefined &&
      consultationMin !== "" &&
      !isNaN(Number(consultationMin))
        ? parseInt(consultationMin, 10)
        : null;
    const cMax =
      consultationMax !== undefined &&
      consultationMax !== "" &&
      !isNaN(Number(consultationMax))
        ? parseInt(consultationMax, 10)
        : null;

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
        page,
        limit,
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
      "tradeLicenseDocument",
      "dhaLicenseDocument",
      "establishmentCard",
    ];
    for (const field of singleFields) {
      if (files[field] && files[field][0]) {
        const file = files[field][0];
        const uploaded = await s3Handler.uploadFile(file, `hospitals/${hospitalId}/documents`);
        patch[field] = uploaded.url;
        patch[`${field}Key`] = uploaded.key;
      }
    }

    const arrayFields = ["insuranceDocuments", "accreditationCertificates"];
    for (const field of arrayFields) {
      if (files[field] && files[field].length > 0) {
        const uploadedArr = await Promise.all(
          files[field].map((file) =>
            s3Handler.uploadFile(file, `hospitals/${hospitalId}/documents`)
          )
        );
        patch[field] = uploadedArr.map((u) => u.url);
        patch[`${field}Key`] = uploadedArr.map((u) => u.key);
      }
    }

    if (Object.keys(patch).length === 0) {
      return formatHospital(hospital);
    }

    const updated = await prisma.hospital.update({
      where: { id: hospitalId },
      data: patch,
      include: { finance: true },
    });

    return await populateHospitalPresignedUrls(updated);
  }

  async uploadBranding(hospitalId, files, primaryColor, secondaryColor) {
    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId },
    });
    if (!hospital) throw new Error("Hospital not found");

    const patch = {};

    if (files.logo && files.logo[0]) {
      const uploaded = await s3Handler.uploadFile(
        files.logo[0],
        `hospitals/${hospitalId}/branding`
      );
      patch.logoUrl = uploaded.url;
      patch.logoKey = uploaded.key;
    }

    if (files.banner && files.banner[0]) {
      const uploaded = await s3Handler.uploadFile(
        files.banner[0],
        `hospitals/${hospitalId}/branding`
      );
      patch.bannerUrl = uploaded.url;
      patch.bannerKey = uploaded.key;
    }

    if (primaryColor !== undefined) patch.primaryColor = primaryColor;
    if (secondaryColor !== undefined) patch.secondaryColor = secondaryColor;

    if (Object.keys(patch).length === 0) {
      return formatHospital(hospital);
    }

    const updated = await prisma.hospital.update({
      where: { id: hospitalId },
      data: patch,
      include: { finance: true },
    });

    return await populateHospitalPresignedUrls(updated);
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

async function fetchDoctorCount(hospitalId) {
  try {
    const { data } = await axios.get(
      `${process.env.API_GATEWAY}/profiles/doctors/hospital/${hospitalId}?status=ACTIVE`,
      {
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

function getDaysInRange(startStr, endStr) {
  const dayNames = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  if (!startStr && !endStr) return dayNames;

  const start = new Date(startStr || endStr);
  const end = new Date(endStr || startStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return dayNames;

  const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
  if (diffDays >= 6) {
    return dayNames;
  }

  const days = [];
  const curr = new Date(start);
  while (curr <= end) {
    const dayName = dayNames[curr.getUTCDay()];
    if (!days.includes(dayName)) days.push(dayName);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return days;
}

function addOrCondition(whereObj, conditions) {
  if (!conditions || conditions.length === 0) return;
  if (!whereObj.OR && !whereObj.AND) {
    whereObj.OR = conditions;
  } else {
    whereObj.AND = whereObj.AND || [];
    if (whereObj.OR) {
      whereObj.AND.push({ OR: whereObj.OR });
      delete whereObj.OR;
    }
    whereObj.AND.push({ OR: conditions });
  }
}

export default new HospitalService();
