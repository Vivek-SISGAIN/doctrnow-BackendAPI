import prisma from "../prisma/client.js";
import axios from "axios";

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
      },
      include: {
        finance: true
      }
    });

    return hospital;
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

 
  async getHospitals(){
  const hospitals = await prisma.hospital.findMany({
    include: { finance: true },
    orderBy: { createdAt: "desc" },
  });
 
  // 2. For every hospital, fire both requests in parallel
  const enriched = await Promise.all(
    hospitals.map(async (hospital) => {
      const [totalConsultations, doctors] = await Promise.all([
        fetchConsultationCount(hospital.id),
        fetchDoctorCount(hospital.id),
      ]);
      return {
        ...hospital,
        totalConsultations,
        doctors,
      } ;
    }),
  );
 
  return enriched;
}

}


async function fetchConsultationCount(hospitalId) {
  try {
    const { data } = await axios.get(`${process.env.API_GATEWAY}/appointments`, {
      params: { hospitalId },
    });
 
    if (Array.isArray(data)) return data.length;
    if (typeof data?.total === "number") return data.total;
    if (Array.isArray(data?.data)) return data.data.length;
    return 0;
  } catch {
    return 0; // never let one failure break the whole list
  }
}

async function fetchDoctorCount(hospitalId){
  try {
    const { data } = await axios.get(`${process.env.API_GATEWAY}/profiles/doctors/hospital/${hospitalId}`);
    if (Array.isArray(data)) return data.length;
    if (typeof data?.total === "number") return data.total;
    if (Array.isArray(data?.data)) return data.data.length;
    return 0;
  } catch (err) {
    console.log(err.response?.data || err.message || "Unknown error while fetching doctor count");
    return 0;
  }
}


export default new HospitalService();