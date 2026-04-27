const BASE_GATEWAY_URL = (process.env.BASE_URL || 'http://localhost:8080/api/v1/').replace(/\/$/, '');

class ProfileClient {
  async getPatientProfile(patientId, authHeader) {
    try {
      const response = await fetch(`${BASE_GATEWAY_URL}/profiles/patients/${patientId}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': authHeader 
        }
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.data;
    } catch (err) {
      console.warn('API Gateway unreachable for patient profile', { patientId, error: err.message });
      return null;
    }
  }

  async getPatientsByBulkIds(ids, authHeader) {
    if (!ids || ids.length === 0) return {};
    try {
      const response = await fetch(`${BASE_GATEWAY_URL}/profiles/patients/bulk`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': authHeader 
        },
        body: JSON.stringify({ ids })
      });

      if (!response.ok) {
        return {};
      }

      const result = await response.json();
      return result.data || {};
    } catch (err) {
      console.warn('API Gateway unreachable for patient bulk fetch', { ids, error: err.message });
      return {};
    }
  }

  /**
   * Fetch doctor profiles in bulk via API Gateway
   * @param {string[]} ids 
   * @param {string} authHeader Bearer token from patient
   */
  async getDoctorsByBulkIds(ids, authHeader) {
    if (!ids || ids.length === 0) return {};
    try {
      // Corrected Path: Must include /doctors/ segment to match profile-service routes
      const response = await fetch(`${BASE_GATEWAY_URL}/profiles/doctors/bulk`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': authHeader 
        },
        body: JSON.stringify({ ids })
      });

      if (!response.ok) {
        console.warn('Gateway profiles bulk fetch failed', { status: response.status });
        return {};
      }

      const result = await response.json();
      return result.data || {};
    } catch (err) {
      console.warn('API Gateway unreachable for doctor bulk fetch', { error: err.message });
      return {};
    }
  }
}

module.exports = new ProfileClient();
