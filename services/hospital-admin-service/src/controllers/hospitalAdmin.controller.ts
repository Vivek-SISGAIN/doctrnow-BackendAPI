import { Request, Response } from 'express';
import hospitalAdminService from '../services/hospitalAdmin.service';

export class HospitalAdminController {

    async createHospitalAdmin(req: Request, res: Response) {

        const {
            fullName,
            email,
            phoneNumber,
            gender,
            nationality,
            emiratesId,
            hospitalName,
            hospitalId,
            position,
            department,
            profileImage,
            role,
            tenantId,
            password
        } = req.body;
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Invalid email format"
            });
        }

        // Phone validation
        if (!phoneNumber || phoneNumber.length < 8 || phoneNumber.length > 15) {
            return res.status(400).json({
                success: false,
                message: "Invalid phone number"
            });
        }

        // Required fields
        if (!hospitalId || !hospitalName) {
            return res.status(400).json({
                success: false,
                message: "Hospital ID and Hospital Name are required"
            });
        }

        if (!role || role !== "HOSPITAL_ADMIN") {
            return res.status(400).json({
                success: false,
                message: "Role must be HOSPITAL_ADMIN"
            });
        }

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: "Tenant ID is required"
            });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const hospitalAdmin = await hospitalAdminService.createHospitalAdmin({
            fullName,
            email,
            phoneNumber,
            gender,
            nationality,
            emiratesId,
            hospitalName,
            hospitalId,
            position,
            department,
            profileImage,
            role,
            tenantId,
            password
        });

        return res.status(201).json({
            success: true,
            message: "Hospital Admin created successfully",
            data: hospitalAdmin
        });
    }

}

export default new HospitalAdminController();