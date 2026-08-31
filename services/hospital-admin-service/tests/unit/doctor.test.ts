import createDoctorSchema, { updateDoctorStatusSchema } from '../../src/validators/doctor.validator';
import doctorService from '../../src/services/doctor.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Doctor Service & Validation - Ophthalmology Speciality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validOphthalmologyDoctorPayload = {
    fullName: 'Dr. Tariq Al-Mansoor',
    email: 'tariq.mansoor@doctornow.com',
    mobile: '971501234571',
    gender: 'MALE',
    nationality: 'UAE',
    emiratesId: '784198855555555',
    primarySpecialization: 'Ophthalmology',
    subSpecialization: 'Cornea & Refractive Surgery',
    licenseNumber: 'DHA-OPHTH-2023-005',
    licenseType: 'DHA',
    licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    yearsOfExperience: 12,
    medicalDegree: 'MBBS, MD (Ophthalmology)',
    university: 'Dubai Medical College',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tariq',
    languagesSpoken: ['English', 'Arabic'],
    servicesOffered: ['Cataract Surgery', 'LASIK', 'Glaucoma Management', 'Eye Exam'],
    certifications: ['FRCS (Ophth)', 'DHA Specialist'],
    professionalMemberships: ['Emirates Medical Association', 'American Academy of Ophthalmology'],
    professionalBio: 'Experienced Consultant Ophthalmologist specializing in advanced cataract and laser refractive eye surgeries.',
    schedule: {
      MONDAY: {
        from: '09:00',
        to: '17:00'
      },
      WEDNESDAY: {
        from: '09:00',
        to: '17:00'
      },
      THURSDAY: {
        from: '09:00',
        to: '17:00'
      }
    },
    videoConsultationFee: 250,
    phoneConsultationFee: 180,
    followUpFee: 120,
    hospitalSharePercent: 70,
    platformSharePercent: 30,
    role: 'DOCTOR',
    tenantId: '00000000-0000-0000-0000-000000000001',
    password: 'Password123!'
  };

  describe('Validation for Ophthalmology Doctor', () => {
    it('should successfully validate a complete Ophthalmology doctor creation payload', () => {
      const { error, value } = createDoctorSchema.validate(validOphthalmologyDoctorPayload);
      expect(error).toBeUndefined();
      expect(value.primarySpecialization).toBe('Ophthalmology');
      expect(value.hospitalSharePercent + value.platformSharePercent).toBe(100);
    });

    it('should fail validation if primarySpecialization is missing', () => {
      const invalidPayload = { ...validOphthalmologyDoctorPayload, primarySpecialization: undefined };
      const { error } = createDoctorSchema.validate(invalidPayload);
      expect(error).toBeDefined();
      expect(error?.message).toContain('primarySpecialization');
    });

    it('should fail validation if hospital and platform shares do not total 100%', () => {
      const invalidPayload = {
        ...validOphthalmologyDoctorPayload,
        hospitalSharePercent: 60,
        platformSharePercent: 30
      };
      const { error } = createDoctorSchema.validate(invalidPayload);
      expect(error).toBeDefined();
      expect(error?.message).toContain('must total 100');
    });

    it('should validate status update to ACTIVE or INACTIVE', () => {
      const activeVal = updateDoctorStatusSchema.validate({ status: 'ACTIVE' });
      expect(activeVal.error).toBeUndefined();

      const inactiveVal = updateDoctorStatusSchema.validate({ status: 'INACTIVE' });
      expect(inactiveVal.error).toBeUndefined();

      const invalidVal = updateDoctorStatusSchema.validate({ status: 'UNKNOWN' });
      expect(invalidVal.error).toBeDefined();
    });
  });

  describe('Doctor Service createDoctor Flow', () => {
    it('should create auth user and doctor profile for Ophthalmology specialist', async () => {
      process.env.API_BASE_URL = 'http://localhost:8080/';

      // Mock check-exists endpoint
      mockedAxios.post.mockImplementation((url: string) => {
        if (url.includes('profiles/doctors/check-exists')) {
          return Promise.resolve({ data: { success: true, data: { exists: false } } }) as any;
        }
        if (url.includes('auth/register')) {
          return Promise.resolve({
            data: { success: true, userId: 'user-ophth-123' }
          }) as any;
        }
        if (url.includes('profiles/doctors')) {
          return Promise.resolve({
            data: {
              success: true,
              data: {
                id: 'doc-ophth-123',
                userId: 'user-ophth-123',
                fullName: 'Dr. Tariq Al-Mansoor',
                primarySpecialization: 'Ophthalmology',
                status: 'PENDING',
                hospitalId: 'hosp-123'
              }
            }
          }) as any;
        }
        if (url.includes('appointments/slots/bulk')) {
          return Promise.resolve({ data: { success: true, data: { count: 48 } } }) as any;
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const result = await doctorService.createDoctor(
        {
          ...validOphthalmologyDoctorPayload,
          hospitalId: 'hosp-123',
          licenseExpiry: new Date(validOphthalmologyDoctorPayload.licenseExpiry),
          schedule: {
            MONDAY: {
              enabled: true,
              slots: [{ startTime: '09:00', endTime: '17:00', consultationDuration: '30' }]
            }
          }
        },
        'Bearer test-token'
      );

      expect(result.data.primarySpecialization).toBe('Ophthalmology');
      expect(result.data.id).toBe('doc-ophth-123');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('profiles/doctors/check-exists'),
        expect.objectContaining({ email: 'tariq.mansoor@doctornow.com' }),
        expect.any(Object)
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('auth/register'),
        expect.objectContaining({ email: 'tariq.mansoor@doctornow.com', role: 'DOCTOR' })
      );
    });

    it('should throw an error and not proceed if doctor already exists', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: { exists: true, field: 'license number' } }
      } as any);

      await expect(
        doctorService.createDoctor(
          {
            ...validOphthalmologyDoctorPayload,
            hospitalId: 'hosp-123',
            licenseExpiry: new Date(validOphthalmologyDoctorPayload.licenseExpiry),
            schedule: {}
          },
          'Bearer test-token'
        )
      ).rejects.toThrow('Doctor already exists with the provided license number');
    });
  });

  describe('Doctor Status Update & Patient Visibility Transition', () => {
    it('should update doctor status to ACTIVE in profile-service and auth-service', async () => {
      process.env.API_BASE_URL = 'http://localhost:8080/';

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            id: 'doc-ophth-123',
            userId: 'user-ophth-123',
            primarySpecialization: 'Ophthalmology',
            status: 'PENDING'
          }
        }
      } as any);

      mockedAxios.patch.mockImplementation((url: string) => {
        if (url.includes('profiles/doctors/doc-ophth-123')) {
          return Promise.resolve({
            data: {
              success: true,
              data: {
                id: 'doc-ophth-123',
                status: 'ACTIVE',
                primarySpecialization: 'Ophthalmology'
              }
            }
          }) as any;
        }
        if (url.includes('auth/users/user-ophth-123/status')) {
          return Promise.resolve({
            data: { success: true, message: 'User status updated' }
          }) as any;
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await doctorService.updateStatus('doc-ophth-123', 'ACTIVE', 'Bearer token');

      expect(res.profile.status).toBe('ACTIVE');
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        expect.stringContaining('profiles/doctors/doc-ophth-123'),
        { status: 'ACTIVE' },
        expect.any(Object)
      );
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        expect.stringContaining('auth/users/user-ophth-123/status'),
        { status: 'ACTIVE' },
        expect.any(Object)
      );
    });
  });
});
