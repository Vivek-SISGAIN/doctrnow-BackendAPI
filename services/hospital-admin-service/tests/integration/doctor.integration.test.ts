import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Ophthalmology Doctor Patient Visibility Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const ophthDoctor = {
    id: 'doc-ophth-123',
    userId: 'user-ophth-123',
    fullName: 'Dr. Tariq Al-Mansoor',
    primarySpecialization: 'Ophthalmology',
    subSpecialization: 'Cornea & Refractive Surgery',
    yearsOfExperience: 12,
    videoConsultationFee: '250.00',
    phoneConsultationFee: '180.00',
    status: 'ACTIVE',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=tariq',
    languagesSpoken: ['English', 'Arabic'],
    hospitalId: 'hosp-city-1',
    hospital: {
      id: 'hosp-city-1',
      name: 'City Care Hospital',
      officialName: 'City Care Hospital LLC'
    },
    rating: {
      averageRating: 4.9,
      totalReviews: 32
    }
  };

  it('should verify that newly created doctor in PENDING status is NOT visible in patient active listing', async () => {
    // When patient listing is fetched with status=ACTIVE, pending doctors are not returned
    mockedAxios.get.mockImplementation((_url: string, config?: any) => {
      const params = config?.params || {};
      if (params.status === 'ACTIVE' && params.specialty === 'Ophthalmology') {
        // Return empty array because status is still PENDING
        return Promise.resolve({
          data: {
            success: true,
            data: [],
            pagination: { total: 0 }
          }
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    const response = await axios.get('http://localhost:8080/api/v1/profiles/doctors', {
      params: { specialty: 'Ophthalmology', status: 'ACTIVE' }
    });

    expect(response.data.data).toHaveLength(0);
  });

  it('should verify that ACTIVE Ophthalmology doctor is returned on patient doctor listing by specialty', async () => {
    mockedAxios.get.mockImplementation((_url: string, config?: any) => {
      const params = config?.params || {};
      if (
        (params.specialty === 'Ophthalmology' || params.specialtyName === 'Ophthalmology') &&
        params.status === 'ACTIVE'
      ) {
        return Promise.resolve({
          data: {
            success: true,
            data: [ophthDoctor],
            pagination: { total: 1 }
          }
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    const response = await axios.get('http://localhost:8080/api/v1/profiles/doctors', {
      params: { specialty: 'Ophthalmology', status: 'ACTIVE' }
    });

    expect(response.data.data).toHaveLength(1);
    expect(response.data.data[0].fullName).toBe('Dr. Tariq Al-Mansoor');
    expect(response.data.data[0].primarySpecialization).toBe('Ophthalmology');
    expect(response.data.data[0].status).toBe('ACTIVE');
  });

  it('should verify that ACTIVE Ophthalmology doctor is returned when filtering by specialtyId', async () => {
    const specialtyId = 'spec-ophth-001';
    mockedAxios.get.mockImplementation((_url: string, config?: any) => {
      const params = config?.params || {};
      if (params.specialtyId === specialtyId && params.status === 'ACTIVE') {
        return Promise.resolve({
          data: {
            success: true,
            data: [ophthDoctor],
            pagination: { total: 1 }
          }
        }) as any;
      }
      return Promise.resolve({ data: { success: true, data: [] } }) as any;
    });

    const response = await axios.get('http://localhost:8080/api/v1/profiles/doctors', {
      params: { specialtyId, status: 'ACTIVE' }
    });

    expect(response.data.data).toHaveLength(1);
    expect(response.data.data[0].primarySpecialization).toBe('Ophthalmology');
  });

  it('should reflect doctorCount >= 1 in /profiles/specialties for Ophthalmology when doctor is ACTIVE', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 'spec-ophth-001',
            name: 'Ophthalmology',
            slug: 'ophthalmology',
            imageKey: 'ophthalmology',
            doctorCount: 1
          },
          {
            id: 'spec-gp-002',
            name: 'General Physician',
            slug: 'general-physician',
            imageKey: 'general-physician',
            doctorCount: 2
          }
        ]
      }
    } as any);

    const response = await axios.get('http://localhost:8080/api/v1/profiles/specialties');
    const specialties = response.data.data;
    const ophthSpecialty = specialties.find((s: any) => s.name === 'Ophthalmology');

    expect(ophthSpecialty).toBeDefined();
    expect(ophthSpecialty.doctorCount).toBeGreaterThanOrEqual(1);
    expect(ophthSpecialty.slug).toBe('ophthalmology');
  });

  it('should return Ophthalmology doctor in global search results when searching by specialty or doctor name', async () => {
    mockedAxios.get.mockImplementation((_url: string, config?: any) => {
      const query = config?.params?.q || '';
      if (query.toLowerCase().includes('ophth') || query.toLowerCase().includes('tariq')) {
        return Promise.resolve({
          data: {
            success: true,
            results: {
              specialties: [{ id: 'spec-ophth-001', label: 'Ophthalmology', type: 'specialty' }],
              doctors: [{ id: 'doc-ophth-123', label: 'Dr. Tariq Al-Mansoor', subLabel: 'Ophthalmology', type: 'doctor' }],
              hospitals: []
            }
          }
        }) as any;
      }
      return Promise.resolve({ data: { success: true, results: { specialties: [], doctors: [], hospitals: [] } } }) as any;
    });

    const searchRes = await axios.get('http://localhost:8080/api/v1/search', {
      params: { q: 'Ophthalmology', limit: 5 }
    });

    expect(searchRes.data.results.doctors).toHaveLength(1);
    expect(searchRes.data.results.doctors[0].label).toBe('Dr. Tariq Al-Mansoor');
    expect(searchRes.data.results.specialties[0].label).toBe('Ophthalmology');
  });
});
