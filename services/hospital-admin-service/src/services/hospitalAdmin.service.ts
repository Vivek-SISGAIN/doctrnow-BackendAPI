import axios from 'axios';

export class HospitalAdminService {
     async createHospitalAdmin(data: {
    fullName: string;
    email: string;
    phoneNumber: string;
    gender: any;
    nationality: string;
    emiratesId: string;
    hospitalName: string;
    hospitalId: string;
    position: string;
    department?: string;
    profileImage?: string;

    role: string;
    tenantId: string;
    password: string;
}) {

    const {
        password,
        role,
        tenantId,
        ...profilePayload
    } = data;

    let createdUserId: string | null = null;
    let createdProfileId: string | null = null;

    try {

        // 1️⃣ Create user in auth-service
        const authResponse = await axios.post(
            `${process.env.API_BASE_URL}/api/v1/auth/register`,
            {
                email: profilePayload.email,
                password,
                role,
                tenantId
            }
        );

        createdUserId = authResponse.data.userId;
        // 2️⃣ Create hospital admin profile
        const hospitalAdminResponse = await axios.post(
            `${process.env.API_BASE_URL}/api/v1/profiles/hospital-admins`,
            {
                ...profilePayload,
                userId: createdUserId
            },
            {
                headers: {
                    "X-Tenant-Id": tenantId,
                    "X-Service-Name": "profile-service"
                }
            }
        );
        createdProfileId = hospitalAdminResponse.data.id;

        return hospitalAdminResponse.data;

    } catch (error) {

            try {
                await axios.delete(
                    `${process.env.API_BASE_URL}/api/v1/auth/users/${createdUserId}`
                );

                 await axios.delete(
                    `${process.env.API_BASE_URL}/api/v1/profiles/hospital-admins${createdProfileId}`
                );
            } catch (cleanupError) {
                console.error(
                    "Failed to rollback user creation",
                );
            }
        

        throw error;
    }
}
}

export default new HospitalAdminService();
