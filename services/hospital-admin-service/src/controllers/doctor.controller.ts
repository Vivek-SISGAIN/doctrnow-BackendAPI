import { Request, Response } from 'express';
import doctorService from '../services/doctor.service';
import { uploadToS3, uploadDoctorDocument } from '../utils/s3Handler';

export class DoctorController {
    async createDoctor(req: any, res: Response) {
        let {
            fullName,
            email,
            mobile,
            gender,
            nationality,
            hospitalId,
            emiratesId,
            primarySpecialization,
            subSpecialization,
            licenseNumber,
            licenseType,
            licenseExpiry,
            yearsOfExperience,
            medicalDegree,
            university,
            countryOfEducation,
            educationDetails,
            experienceDetails,
            languagesSpoken,
            servicesOffered,
            certifications,
            professionalMemberships,
            professionalBio,
            schedule,
            videoConsultationFee,
            phoneConsultationFee,
            followUpFee,
            hospitalSharePercent,
            platformSharePercent,
            role,
            password,
            tenantId,
        } = req.body;

        // Parse array/object fields if they come stringified via FormData
        if (typeof req.body.languagesSpoken === 'string') languagesSpoken = JSON.parse(req.body.languagesSpoken);
        if (typeof req.body.servicesOffered === 'string') servicesOffered = JSON.parse(req.body.servicesOffered);
        if (typeof req.body.certifications === 'string') certifications = JSON.parse(req.body.certifications);
        if (typeof req.body.professionalMemberships === 'string') professionalMemberships = JSON.parse(req.body.professionalMemberships);
        if (typeof req.body.schedule === 'string') schedule = JSON.parse(req.body.schedule);
        // `createDoctorUpload` uses `multer.fields`, so uploaded files arrive on `req.files`.
        // Still support any older middleware that might populate `req.file`.
        const filesByField = (req.files ?? {}) as Record<string, any[]>;
        const profileImageFile = (filesByField?.profileImage?.[0] ?? req.file) as any;

        let profileImageKey = "";
        if (profileImageFile) {
            try {
                const s3Result = await uploadToS3(profileImageFile as any);
                profileImageKey = s3Result.key;
            } catch (error) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload profile image'
                });
            }
        }

        console.log(req.body)
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

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tenant ID'
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

        if (parseInt(hospitalSharePercent) + parseInt(platformSharePercent) !== 100) {
            console.log("Total" , parseInt(hospitalSharePercent) + parseInt(platformSharePercent))
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

        if (schedule && typeof schedule !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'schedule must be an object'
            });
        }

        try {
            const authHeader = req.headers.authorization ?? '';
            const doctor = await doctorService.createDoctor({
                fullName,
                email,
                mobile,
                gender,
                nationality,
                hospitalId,
                emiratesId,
                primarySpecialization,
                subSpecialization,
                licenseNumber,
                licenseType,
                licenseExpiry: expiryDate,
                yearsOfExperience: parseInt(yearsOfExperience),
                medicalDegree,
                university,
                countryOfEducation,
                educationDetails,
                experienceDetails,
                profileImage: profileImageKey,
                languagesSpoken,
                servicesOffered,
                certifications,
                professionalMemberships,
                professionalBio,
                schedule,
                videoConsultationFee: parseFloat(videoConsultationFee),
                phoneConsultationFee: parseFloat(phoneConsultationFee),
                followUpFee: parseFloat(followUpFee),
                hospitalSharePercent: parseInt(hospitalSharePercent),
                platformSharePercent: parseInt(platformSharePercent),
                role,
                password,
                tenantId
            }, authHeader);

            // If documents were included during create, upload + persist them now.
            const docFieldNames = [
                'medicalLicense',
                'emiratesId',
                'passport',
                'professionalPhoto',
                'medicalDegree',
                'specialistCert',
                'cvResume',
                'goodStanding',
            ] as const;

            const createdDoctor: any = doctor?.data ?? doctor;
            const createdDoctorId: string | undefined = createdDoctor?.id;

            const uploadedDocs: Record<string, { key: string; fileName: string; mime: string }> = {};
            if (createdDoctorId) {
                for (const docType of docFieldNames) {
                    const file = filesByField?.[docType]?.[0];
                    if (!file) continue;
                    const s3Result = await uploadDoctorDocument(file, createdDoctorId, docType);
                    uploadedDocs[docType] = s3Result;
                }
            }

            const updatedDoctor = Object.keys(uploadedDocs).length > 0 && createdDoctorId
                ? await doctorService.uploadDocuments(createdDoctorId, uploadedDocs, authHeader)
                : createdDoctor;

            return res.status(201).json({
                success: true,
                message: 'Doctor created successfully',
                data: updatedDoctor
            });
        } catch (error: any) {
            console.error('[DoctorController] createDoctor error:', error?.response?.data || error.message);
            const status = error?.status || error?.response?.status || (error.message?.includes('already exists') ? 409 : 500);
            const message = error?.response?.data?.message || error?.response?.data?.error?.message || error.message || 'Failed to create doctor';
            return res.status(status).json({
                success: false,
                message: message
            });
        }
    }


    async updateStatus(req: Request, res: Response) {
    const { id } = req.params;
    const { status } = req.body;
    const authHeader = req.headers.authorization ?? '';

    if (!status || !['ACTIVE', 'INACTIVE'].includes(status)) {
        return res.status(400).json({
            success: false,
            message: "Status must be 'ACTIVE' or 'INACTIVE'",
        });
    }

    const result = await doctorService.updateStatus(id, status, authHeader);

    return res.status(200).json({
        success: true,
        message: `Doctor status updated to ${status}`,
        data: result,
    });
}

    async uploadDocuments(req: any, res: Response) {
        const { id } = req.params;
        const authHeader = req.headers.authorization ?? '';
        
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded',
            });
        }

        try {
            const uploadedDocs: Record<string, { key: string; fileName: string; mime: string }> = {};
            
            // req.files is an object where keys are field names (e.g., 'medicalLicense') 
            // and values are arrays of files
            for (const [docType, files] of Object.entries(req.files as Record<string, any[]>)) {
                if (files && files.length > 0) {
                    const file = files[0];
                    const s3Result = await uploadDoctorDocument(file, id, docType);
                    uploadedDocs[docType] = s3Result;
                }
            }

            const updatedDoctor = await doctorService.uploadDocuments(id, uploadedDocs, authHeader);

            return res.status(200).json({
                success: true,
                message: 'Documents uploaded successfully',
                data: updatedDoctor,
            });
        } catch (error: any) {
            console.error('[DoctorController] uploadDocuments error:', error?.response?.data || error.message);
            const status = error?.response?.status || 500;
            const message = error?.response?.data?.message || error.message || 'Failed to upload documents';
            return res.status(status).json({
                success: false,
                message: message
            });
        }
    }
}

export default new DoctorController();
