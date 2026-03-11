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

    try {

        // 1️⃣ Create user in auth-service
        const authResponse = await axios.post(
            "http://localhost:8080/api/v1/auth/register",
            {
                email: profilePayload.email,
                password,
                role,
                tenantId
            }
        );

        createdUserId = authResponse.data.userId;
        console.log("U are getting the user" ,createdUserId )
        // 2️⃣ Create hospital admin profile
        const hospitalAdminResponse = await axios.post(
            "http://localhost:8080/api/v1/profiles/hospital-admins",
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

        return hospitalAdminResponse.data;

    } catch (error) {

        // 3️⃣ Compensation rollback
        if (createdUserId) {
            try {
                await axios.delete(
                    `http://localhost:3001/auth/v1/users/${createdUserId}`
                );
            } catch (cleanupError) {
                console.error(
                    "Failed to rollback user creation",
                );
            }
        }

        throw error;
    }
}
}

export default new HospitalAdminService();
