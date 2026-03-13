// import prisma from '../prisma/prisma';
import axios from 'axios';

class DoctorService {
    async createDoctor(data: {
        fullName: string;
        hospitalId :string;
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
        schedule: Record<string, { from: string; to: string }>;
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
            schedule,
            ...profilePayload
        } = data;

        let createdUserId: string | null = null;

        try {
            const authResponse = await axios.post(
                'http://localhost:8080/api/v1/auth/register',
                {
                    email: profilePayload.email,
                    password,
                    role,
                    tenantId,
                }
            );

            createdUserId = authResponse.data.userId;

            const doctorResponse = await axios.post(
                'http://localhost:8080/api/v1/profiles/doctors',
                {
                    ...profilePayload,
                    schedule,
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
    // In DoctorService class

async updateStatus(doctorProfileId: string, status: 'ACTIVE' | 'INACTIVE', authHeader: string) {
    const forwardHeaders = {
        Authorization: authHeader,
        'Content-Type': 'application/json',
    };

    // Step 1: Fetch doctor profile to get linked userId
    const profileRes = await axios.get(
        `http://localhost:8080/api/v1/profiles/doctors/${doctorProfileId}`,
        { headers: forwardHeaders }
    );

    const doctorProfile = profileRes.data?.data;
    const userId: string = doctorProfile?.userId;

    console.log(doctorProfileId , "DOCTOR PROFILE" )
    if (!userId) {
        throw new Error('Doctor profile has no linked userId');
    }

    // Step 2: Update profile-service
    const profileUpdateRes = await axios.patch(
        `http://localhost:8080/api/v1/profiles/doctors/${doctorProfileId}`,
        { status },
        { headers: forwardHeaders }
    );

    // Step 3: Update auth-service
    const authUpdateRes = await axios.patch(
        `http://localhost:8080/api/v1/auth/users/${userId}/status`,
        { status },
        { headers: forwardHeaders }
    );

    return {
        profile: profileUpdateRes.data?.data,
        auth: authUpdateRes.data,
    };
}
}


export default new DoctorService();
