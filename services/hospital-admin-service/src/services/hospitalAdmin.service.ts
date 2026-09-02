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
    tenantId: string;
    role: string;
    subRole?: string;
    password: string;
}, authHeader: string) {

    const {
        password,
        role,
        tenantId,
        ...profilePayload
    } = data;

    let createdUserId: string | null = null;
    let createdProfileId: string | null = null;

    const internalSecret = process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123';
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:8080/';
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    try {
        // 1️⃣ Create user in auth-service
        const authResponse = await axios.post(
            `${cleanBaseUrl}api/v1/auth/register`,
            {
                email: profilePayload.email,
                password,
                role,
                tenantId
            },
            {
                headers: {
                    ...(authHeader ? { Authorization: authHeader } : {}),
                    'x-internal-service-key': internalSecret,
                }
            }
        );

        createdUserId =
            authResponse.data?.data?.userId ||
            authResponse.data?.userId ||
            authResponse.data?.id;

        // 2️⃣ Create hospital admin profile
        const hospitalAdminResponse = await axios.post(
            `${cleanBaseUrl}api/v1/profiles/hospital-admins`,
            {
                ...profilePayload,
                userId: createdUserId
            },
            {
                headers: {
                    ...(authHeader ? { Authorization: authHeader } : {}),
                    'x-internal-service-key': internalSecret,
                    'X-Service-Name': 'profile-service'
                }
            }
        );
        createdProfileId =
            hospitalAdminResponse.data?.data?.id ||
            hospitalAdminResponse.data?.id;

        return hospitalAdminResponse.data?.data || hospitalAdminResponse.data;

    } catch (error) {
        if (createdUserId) {
            try {
                await axios.delete(
                    `${cleanBaseUrl}api/v1/auth/users/${createdUserId}`,
                    {
                        headers: {
                            ...(authHeader ? { Authorization: authHeader } : {}),
                            'x-internal-service-key': internalSecret,
                        }
                    }
                );
            } catch (cleanupError) {
                console.error("Failed to rollback auth user creation:", cleanupError);
            }
        }

        if (createdProfileId) {
            try {
                await axios.delete(
                    `${cleanBaseUrl}api/v1/profiles/hospital-admins/${createdProfileId}`,
                    {
                        headers: {
                            ...(authHeader ? { Authorization: authHeader } : {}),
                            'x-internal-service-key': internalSecret,
                        }
                    }
                );
            } catch (cleanupError) {
                console.error("Failed to rollback hospital admin profile creation:", cleanupError);
            }
        }

        throw error;
    }
}
}

export default new HospitalAdminService();
