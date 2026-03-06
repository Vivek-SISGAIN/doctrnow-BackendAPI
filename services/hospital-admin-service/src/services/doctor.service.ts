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
        const {
            password,
            role,
            tenantId,
            workingDays,
            ...profilePayload
        } = data;

        let createdUserId: string | null = null;

        try {
            const authResponse = await axios.post(
                'http://localhost:8080/auth/v1/register',
                {
                    email: profilePayload.email,
                    password,
                    role,
                    tenantId,
                }
            );

            createdUserId = authResponse.data.userId;

            const doctorResponse = await axios.post(
                'http://localhost:5000/api/doctors',
                {
                    ...profilePayload,
                    workingDays,
                    userId: createdUserId,
                },
                {
                    headers: {
                        'X-Tenant-Id': tenantId,
                        'X-Service-Name': 'profile-service',
                    },
                }
            );

            return doctorResponse.data;

        } catch (error) {
            // 3️⃣ Compensation logic (rollback)
            if (createdUserId) {
                try {
                    await axios.delete(
                        `http://localhost:3001/auth/v1/users/${createdUserId}`
                    );
                } catch (cleanupError) {
                    // IMPORTANT: log this for ops visibility
                    console.error(
                        'Failed to rollback user creation',
                        (cleanupError as Error).message
                    );
                }
            }

            // Re-throw original error
            throw error;
        }
    }

}


export default new DoctorService();
