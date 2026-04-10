import axios from 'axios';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const UAE_TZ = 'Asia/Dubai';

const DAY_NAME_MAP: Record<number, string> = {
  0: 'SUNDAY',
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY'
};

class DoctorService {
  async createDoctor(data: {
    fullName: string;
    hospitalId: string;
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
    schedule: Record<
      string,
      {
        enabled: boolean;
        slots: Array<{
          startTime: string;
          endTime: string;
          consultationDuration: string;
        }>;
      }
    >;
    videoConsultationFee: number;
    phoneConsultationFee: number;
    followUpFee: number;
    hospitalSharePercent: number;
    platformSharePercent: number;
    role: string;
    tenantId: string;
    password: string;
  }, authHeader: string) {
    const { password, role, schedule, ...profilePayload } = data;

    let createdUserId: string | null = null;
    let createdDoctorId: string | null = null;

    try {
      // Step 0: Check if doctor already exists with any of the unique fields
      const checkResponse = await axios.post(
        `${process.env.API_BASE_URL}api/v1/profiles/doctors/check-exists`,
        {
          email: profilePayload.email,
          mobile: profilePayload.mobile,
          emiratesId: profilePayload.emiratesId,
          licenseNumber: profilePayload.licenseNumber
        },
        {
          headers: {
            'X-Service-Name': 'hospital-admin-service'
          }
        }
      );

      const { exists, field } = checkResponse.data?.data || {};
      
      if (exists) {
        throw new Error(`Doctor already exists with the provided ${field}`);
      }

      // Step 1: Create auth user
      const authResponse = await axios.post(`${process.env.API_BASE_URL}api/v1/auth/register`, {
        email: profilePayload.email,
        password,
        role,
        tenantId: "00000000-0000-0000-0000-000000000001"
      });

      createdUserId = authResponse.data.userId;

      // Step 2: Create doctor profile
      const doctorResponse = await axios.post(
        `${process.env.API_BASE_URL}api/v1/profiles/doctors`,
        { ...profilePayload, schedule, userId: createdUserId , tenantId :"00000000-0000-0000-0000-000000000001" },
        {
          headers: {
            'X-Service-Name': 'hospital-admin-service'
          }
        }
      );

      const doctorProfile = doctorResponse.data?.data;
      createdDoctorId = doctorProfile?.id;

      // Step 3: Generate slots — fire and forget, never blocks doctor creation
      if (createdDoctorId && schedule) {
        const from = dayjs().tz(UAE_TZ).startOf('day').toDate();
        const to = dayjs().tz(UAE_TZ).add(60, 'day').startOf('day').toDate();

        // Intentionally not awaited — slot failure must never fail doctor creation
        this.generateSlotsInRange(
          createdDoctorId,
          doctorProfile?.hospitalId,
          schedule,
          from,
          to,
          "00000000-0000-0000-0000-000000000001"
        ).catch((err) => {
          console.error('[DoctorService] Slot generation failed after doctor create:', err.message);
        });
      }

      return doctorResponse.data;
    } catch (error: any) {
      // Compensation: rollback auth user if anything failed before slot generation
      if (createdUserId) {
        try {
          await axios.delete(`${process.env.API_BASE_URL}api/v1/auth/users/${createdUserId}`, {
             headers: { Authorization: authHeader }
          });
        } catch (cleanupError: any) {
          console.error(
            '[DoctorService] Failed to rollback user creation:',
            cleanupError.message
          );
        }
      }
      throw error;
    }
  }

  /**
   * Update a doctor's schedule.
   * Triggers slot regeneration: deletes AVAILABLE slots and recreates for 60 days.
   * BOOKED / CANCELLED / BLOCKED slots are never touched.
   */
  async updateSchedule(
    doctorProfileId: string,
    newSchedule: Record<string, any>,
    tenantId: string,
    authHeader: string
  ) {
    // Step 1: Persist new schedule in profile-service
    const profileUpdateRes = await axios.patch(
      `${process.env.API_BASE_URL}/profiles/doctors/${doctorProfileId}`,
      { schedule: newSchedule },
      {
        headers: {
          Authorization: authHeader,
          'X-Tenant-Id': tenantId,
          'X-Service-Name': 'hospital-admin-service'
        }
      }
    );

    const doctorProfile = profileUpdateRes.data?.data;

    // Step 2: Regenerate slots — fire and forget
    if (doctorProfile?.id && newSchedule) {
      const from = dayjs().tz(UAE_TZ).startOf('day').toDate();
      const to = dayjs().tz(UAE_TZ).add(60, 'day').startOf('day').toDate();

      this.generateSlotsInRange(
        doctorProfile.id,
        doctorProfile.hospitalId,
        newSchedule,
        from,
        to,
        tenantId,
        true // isUpdate = true → delete AVAILABLE slots first
      ).catch((err) => {
        console.error(
          '[DoctorService] Slot regeneration failed after schedule update:',
          err.message
        );
      });
    }

    return profileUpdateRes.data;
  }

  /**
   * Generate slots for a doctor within a specific date range.
   *
   * This is the single source of truth for slot generation — used by:
   *   - createDoctor (initial generation, isUpdate = false)
   *   - updateSchedule (regeneration, isUpdate = true → deletes AVAILABLE first)
   *   - Nightly cron (extension, isUpdate = false, custom date range)
   *
   * Timezone: all times are treated as Asia/Dubai local time.
   *           dayjs .toDate() converts to UTC before the ISO string is sent to the API.
   *
   * @param doctorId
   * @param hospitalId
   * @param schedule   - raw schedule JSON (Format A with slots[] or Format B with from/to)
   * @param fromDate   - start of the date range to generate (inclusive), UAE midnight
   * @param toDate     - end of the date range to generate (exclusive), UAE midnight
   * @param tenantId
   * @param isUpdate   - if true, appointment-service will delete AVAILABLE slots first
   */
  async generateSlotsInRange(
    doctorId: string,
    hospitalId: string,
    schedule: Record<string, any>,
    fromDate: Date,
    toDate: Date,
    tenantId: string,
    isUpdate = false
  ) {
    const slots: { startTime: string; endTime: string; status: string }[] = [];

    // Total days to iterate
    const totalDays = dayjs(toDate).diff(dayjs(fromDate), 'day');

    for (let i = 0; i < totalDays; i++) {
      // Always work in UAE timezone — this is the source of truth for slot times
      const currentDay = dayjs(fromDate).tz(UAE_TZ).add(i, 'day');
      const dayName = DAY_NAME_MAP[currentDay.day()]; // 'MONDAY', 'TUESDAY', etc.

      const dayConfig = schedule[dayName];

      if (!dayConfig) continue;
      const timeBlocks = this._extractTimeBlocks(dayConfig);

      for (const block of timeBlocks) {
        const { startTime, endTime, consultationDuration } = block;

        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const duration = parseInt(String(consultationDuration), 10) || 30;

        // Build full UAE DateTime for block start and end
        let slotStart = currentDay.hour(startHour).minute(startMin).second(0).millisecond(0);
        const blockEnd = currentDay.hour(endHour).minute(endMin).second(0).millisecond(0);

        while (slotStart.isBefore(blockEnd)) {
          const slotEnd = slotStart.add(duration, 'minute');

          // Drop partial slot that would overrun the block end
          if (slotEnd.isAfter(blockEnd)) break;

          slots.push({
            startTime: slotStart.toDate().toISOString(), // UTC — Prisma stores correctly
            endTime: slotEnd.toDate().toISOString(),
            status: 'AVAILABLE'
          });

          slotStart = slotEnd;
        }
      }
    }

    if (slots.length === 0) {
      console.log(`[DoctorService] No slots to generate for doctor ${doctorId} in range`);
      return { created: 0 };
    }

    try {
      const response = await axios.post(
        `${process.env.API_BASE_URL}/appointments/slots/bulk`,
        { doctorId, hospitalId, slots, isUpdate },
        {
          headers: {
            'X-Tenant-Id': tenantId,
            'X-Service-Name': 'hospital-admin-service'
          },
          timeout: 10000 
        }
      );
      console.log(
        `[DoctorService] Generated ${response.data?.data?.count ?? 0} slots for doctor ${doctorId}`
      );
      return response.data?.data ?? { created: 0 };
    } catch (error) {
      console.error('[DoctorService] Bulk slot API call failed:', (error as Error).message);
      // Never rethrow — slot generation must not break the parent operation
      return { created: 0 };
    }
  }

  /**
   * Extracts time blocks from a day's schedule config.
   * Handles both Format A (slots array) and Format B (from/to).
   */
  private _extractTimeBlocks(dayConfig: any): {
    startTime: string;
    endTime: string;
    consultationDuration: number;
  }[] {
    // Format A: { slots: [...], enabled: true/false }
    if (Array.isArray(dayConfig.slots)) {
      if (dayConfig.enabled === false) return []; // day is disabled
      return dayConfig.slots.map((s: any) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        consultationDuration: parseInt(String(s.consultationDuration), 10) || 30
      }));
    }

    // Format B: { from: '09:00', to: '17:00' }
    if (dayConfig.from && dayConfig.to) {
      return [{ startTime: dayConfig.from, endTime: dayConfig.to, consultationDuration: 30 }];
    }

    return [];
  }

  async updateStatus(doctorProfileId: string, status: 'ACTIVE' | 'INACTIVE', authHeader: string) {
    const forwardHeaders = {
      Authorization: authHeader,
      'Content-Type': 'application/json'
    };

    // Step 1: Fetch doctor profile to get linked userId
    const profileRes = await axios.get(
      `${process.env.API_BASE_URL}/profiles/doctors/${doctorProfileId}`,
      { headers: forwardHeaders }
    );

    const doctorProfile = profileRes.data?.data;
    const userId: string = doctorProfile?.userId;

    if (!userId) {
      throw new Error('Doctor profile has no linked userId');
    }

    // Step 2: Update profile-service
    const profileUpdateRes = await axios.patch(
      `${process.env.API_BASE_URL}/profiles/doctors/${doctorProfileId}`,
      { status },
      { headers: forwardHeaders }
    );

    // Step 3: Update auth-service
    const authUpdateRes = await axios.patch(
      `${process.env.API_BASE_URL}/auth/users/${userId}/status`,
      { status },
      { headers: forwardHeaders }
    );

    return {
      profile: profileUpdateRes.data?.data,
      auth: authUpdateRes.data
    };
  }

  
}
export default new DoctorService();
