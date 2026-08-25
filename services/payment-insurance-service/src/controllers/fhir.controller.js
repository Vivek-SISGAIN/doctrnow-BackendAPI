const cernerFhirService = require('../services/cerner-fhir.service');
const cernerConfig = require('../config/cerner');

/**
 * FHIR Controller for Cerner R4 Sandbox
 */
class FhirController {
  /**
   * Get sandbox test patients list for UI dropdown / quick select
   */
  getKnownPatients = async (req, res, next) => {
    try {
      res.status(200).json({
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        patients: cernerConfig.knownSandboxPatients,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Patient or GET /api/fhir/Patient
   */
  getPatients = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getPatient(null, req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Patient/:id or GET /api/fhir/Patient/:id
   */
  getPatientById = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getPatient(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /Patient or POST /api/fhir/Patient (Create Patient in FHIR R4)
   */
  createPatient = async (req, res, next) => {
    try {
      const result = await cernerFhirService.createPatient(req.body);
      res.setHeader('Location', `/Patient/${result.id}`);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /Patient/:id or PATCH /api/fhir/Patient/:id (JSON Patch RFC 6902)
   */
  patchPatient = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await cernerFhirService.patchPatient(id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Observation or GET /api/fhir/Observation
   */
  getObservations = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getObservations(req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Observation/:id or GET /api/fhir/Observation/:id
   */
  getObservationById = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getObservations({ id: req.params.id });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /Observation or POST /api/fhir/Observation (Create Observation)
   */
  createObservation = async (req, res, next) => {
    try {
      const result = await cernerFhirService.createObservation(req.body);
      res.setHeader('Location', `/Observation/${result.id}`);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /Observation/:id or PUT /api/fhir/Observation/:id (Update Observation)
   */
  updateObservation = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await cernerFhirService.updateObservation(id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Condition or GET /api/fhir/Condition
   */
  getConditions = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getConditions(req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Condition/:id or GET /api/fhir/Condition/:id
   */
  getConditionById = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getConditions({ id: req.params.id });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /Condition or POST /api/fhir/Condition (Create Condition)
   */
  createCondition = async (req, res, next) => {
    try {
      const result = await cernerFhirService.createCondition(req.body);
      res.setHeader('Location', `/Condition/${result.id}`);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /Condition/:id or PUT /api/fhir/Condition/:id (Update Condition)
   */
  updateCondition = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await cernerFhirService.updateCondition(id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Encounter or GET /api/fhir/Encounter
   */
  getEncounters = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getEncounters(req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Encounter/:id or GET /api/fhir/Encounter/:id
   */
  getEncounterById = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getEncounters({ id: req.params.id });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /Encounter or POST /api/fhir/Encounter (Create Encounter)
   */
  createEncounter = async (req, res, next) => {
    try {
      const result = await cernerFhirService.createEncounter(req.body);
      res.setHeader('Location', `/Encounter/${result.id}`);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /Encounter/:id or PATCH /api/fhir/Encounter/:id (Patch Encounter)
   */
  patchEncounter = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await cernerFhirService.patchEncounter(id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /MedicationRequest or GET /api/fhir/MedicationRequest
   */
  getMedicationRequests = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getMedicationRequests(req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /MedicationRequest/:id or GET /api/fhir/MedicationRequest/:id
   */
  getMedicationRequestById = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getMedicationRequests({ id: req.params.id });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /MedicationRequest or POST /api/fhir/MedicationRequest (Create MedicationRequest)
   */
  createMedicationRequest = async (req, res, next) => {
    try {
      const result = await cernerFhirService.createMedicationRequest(req.body);
      res.setHeader('Location', `/MedicationRequest/${result.id}`);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /MedicationRequest/:id or PATCH /api/fhir/MedicationRequest/:id (Patch MedicationRequest)
   */
  patchMedicationRequest = async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await cernerFhirService.patchMedicationRequest(id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Practitioner or GET /api/fhir/Practitioner (Doctor lookup)
   */
  getPractitioners = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getPractitioners(null, req.query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /Practitioner/:id or GET /api/fhir/Practitioner/:id
   */
  getPractitionerById = async (req, res, next) => {
    try {
      const result = await cernerFhirService.getPractitioners(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /Practitioner or POST /api/fhir/Practitioner (Create Practitioner)
   */
  createPractitioner = async (req, res, next) => {
    try {
      const result = await cernerFhirService.createPractitioner(req.body);
      res.setHeader('Location', `/Practitioner/${result.id}`);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /patient-summary/:id or GET /api/fhir/patient-summary/:id
   */
  getPatientSummary = async (req, res, next) => {
    try {
      const patientId = req.params.id || cernerConfig.defaultPatientId;
      const result = await cernerFhirService.getPatientFullChart(patientId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new FhirController();
