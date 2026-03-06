import { Request, Response } from 'express';
import doctorService from '../services/doctor.service';

export class DoctorController {
    // async getAllDoctors(req: Request, res: Response) {
    //     const doctors = await DoctorService.getAllDoctors();
    //     return res.status(200).json({
    //         success: true,
    //         message: 'Doctors retrieved successfully',
    //         data: doctors
    //     });
    // }

    async createDoctor(req: Request, res: Response) {
        const {
            fullName,
            email,
            mobile,
            gender,
            nationality,
            emiratesId,
            primarySpecialization,
            subSpecialization,
            licenseNumber,
            licenseType,
            licenseExpiry,
            yearsOfExperience,
            medicalDegree,
            university,
            profileImage,
            languagesSpoken,
            servicesOffered,
            certifications,
            professionalMemberships,
            professionalBio,
            workingDays,
            workingHoursFrom,
            workingHoursTo,
            consultationDuration,
            videoConsultationFee,
            phoneConsultationFee,
            followUpFee,
            hospitalSharePercent,
            platformSharePercent,
            role,
            tenantId,
            password
        } = req.body;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        if (mobile.length < 8 || mobile.length > 15) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number'
            });
        }

        const expiryDate = new Date(licenseExpiry);
        if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'License expiry must be a future date'
            });
        }

        if (yearsOfExperience < 0 || yearsOfExperience > 60) {
            return res.status(400).json({
                success: false,
                message: 'Years of experience must be between 0 and 60'
            });
        }

        if (consultationDuration < 5) {
            return res.status(400).json({
                success: false,
                message: 'Consultation duration must be at least 5 minutes'
            });
        }

        if (
            videoConsultationFee < 0 ||
            phoneConsultationFee < 0 ||
            followUpFee < 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'Consultation fees must be positive numbers'
            });
        }

        if (
            hospitalSharePercent < 0 ||
            hospitalSharePercent > 100 ||
            platformSharePercent < 0 ||
            platformSharePercent > 100
        ) {
            return res.status(400).json({
                success: false,
                message: 'Share percentages must be between 0 and 100'
            });
        }

        if (hospitalSharePercent + platformSharePercent !== 100) {
            return res.status(400).json({
                success: false,
                message: 'Hospital and platform share must total 100%'
            });
        }

        if (languagesSpoken && !Array.isArray(languagesSpoken)) {
            return res.status(400).json({
                success: false,
                message: 'languagesSpoken must be an array'
            });
        }

        if (servicesOffered && !Array.isArray(servicesOffered)) {
            return res.status(400).json({
                success: false,
                message: 'servicesOffered must be an array'
            });
        }

        if (workingDays && !Array.isArray(workingDays)) {
            return res.status(400).json({
                success: false,
                message: 'workingDays must be an array'
            });
        }

        const doctor = await doctorService.createDoctor({
            fullName,
            email,
            mobile,
            gender,
            nationality,
            emiratesId,
            primarySpecialization,
            subSpecialization,
            licenseNumber,
            licenseType,
            licenseExpiry: expiryDate,
            yearsOfExperience: parseInt(yearsOfExperience),
            medicalDegree,
            university,
            profileImage,
            languagesSpoken,
            servicesOffered,
            certifications,
            professionalMemberships,
            professionalBio,
            workingDays,
            workingHoursFrom,
            workingHoursTo,
            consultationDuration: parseInt(consultationDuration),
            videoConsultationFee: parseFloat(videoConsultationFee),
            phoneConsultationFee: parseFloat(phoneConsultationFee),
            followUpFee: parseFloat(followUpFee),
            hospitalSharePercent: parseInt(hospitalSharePercent),
            platformSharePercent: parseInt(platformSharePercent),
            role,
            tenantId,
            password
        });

        return res.status(201).json({
            success: true,
            message: 'Doctor created successfully',
            data: doctor
        });
    }

}

export default new DoctorController();
