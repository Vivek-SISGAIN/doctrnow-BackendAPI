const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://localhost:5000';

class ProfileClient {
  async getPatientProfile(patientId) {
    try {
      const response = await fetch(`${PROFILE_SERVICE_URL}/api/patients/${patientId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.data;
    } catch (err) {
      console.warn('Profile service unreachable', { patientId, error: err.message });
      return null;
    }
  }
}

module.exports = new ProfileClient();
