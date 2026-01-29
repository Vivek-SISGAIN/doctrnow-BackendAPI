// import prisma from '../prisma/prisma';
import axios from 'axios';

class DoctorService {
    async createDoctor(data: {
        fullName: string;
        email: string;
        mobile: string;
        gender: any;
        nationality: string;
        emiratesId: string;
        primarySpecialization: string;
        subSpecialization?: string;
        licenseNumber: string;
        licenseType: any;
        licenseExpiry: Date;
        yearsOfExperience: number;
        medicalDegree: string;
        university: string;
        profileImage: string;
        languagesSpoken?: string[];
        servicesOffered?: string[];
        certifications?: string[];
        professionalMemberships?: string[];
        professionalBio: string;
        workingDays?: any[];
        workingHoursFrom: string;
        workingHoursTo: string;
        consultationDuration: number;
        videoConsultationFee: number;
        phoneConsultationFee: number;
        followUpFee: number;
        hospitalSharePercent: number;
        platformSharePercent: number;
        role: string;
        tenantId: string;
        password: string;
    }) {

        // 👇 clean separation
        const {
            password,
            role,
            tenantId,
            workingDays,
            ...profilePayload
        } = data;

        // 🔐 AUTH SERVICE
        const authResponse = await axios.post(
            'http://localhost:3001/auth/v1/register',
            {
                email: profilePayload.email,
                password,
                role,
                tenantId
            }
        );

        // 👤 PROFILE SERVICE

        const doctor = await axios.post(
            'http://localhost:5000/api/doctors/',
            {
                ...profilePayload,
                workingDays,
                userId: authResponse.data.userId
            },
            {
                headers: {
                    'X-Tenant-Id': tenantId,
                    'X-Service-Name': 'profile-service'
                }
            }
        );

        return doctor.data;
    }
}


export default new DoctorService();
