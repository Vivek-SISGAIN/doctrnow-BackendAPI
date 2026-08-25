/**
 * Cerner FHIR R4 Sandbox Configuration
 */

module.exports = {
  baseUrl:
    process.env.CERNER_FHIR_BASE_URL ||
    'https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
  defaultPatientId: process.env.DEFAULT_SANDBOX_PATIENT_ID || '12742400',
  timeout: parseInt(process.env.CERNER_TIMEOUT_MS || '45000', 10),
  headers: {
    Accept: 'application/fhir+json',
    'User-Agent': 'DoctorNow-Healthcare-Platform/1.0',
  },
  knownSandboxPatients: [
    { id: '12742400', name: 'Tim Peters', gender: 'male', birthDate: '1990-09-15' },
    { id: '12712400', name: 'Smart Joe', gender: 'male', birthDate: '1985-05-12' },
    { id: '12742401', name: 'Amanda Peters', gender: 'female', birthDate: '1992-03-22' },
  ],
};
