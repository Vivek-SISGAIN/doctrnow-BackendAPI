import prisma from "../prisma/client.js";

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
        tradeLicenseDocument: data.tradeLicenseDocument,
        dhaLicenseDocument: data.dhaLicenseDocument,
        insuranceDocuments: data.insuranceDocuments || [],
        establishmentCard: data.establishmentCard,
        accreditationCertificates: data.accreditationCertificates || [],
        tenantId: data.tenantId
      },
      include: {
        finance: true
      }
    });

    return hospital;
  }

  async getHospitals() {
    return prisma.hospital.findMany({
      include: {
        finance: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async getHospitalById(id) {

    const hospital = await prisma.hospital.findUnique({
      where: { id },
      include: { finance: true }
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
        finance: true
      }
    });

    return hospital;
  }

  async deleteHospital(id) {

    await prisma.hospital.delete({
      where: { id }
    });

    return { message: "Hospital deleted successfully" };
  }

}

export default new HospitalService();