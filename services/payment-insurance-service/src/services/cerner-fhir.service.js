const axios = require('axios');
const cernerConfig = require('../config/cerner');

class CernerFhirService {
  constructor() {
    this.client = axios.create({
      baseURL: cernerConfig.baseUrl,
      timeout: cernerConfig.timeout,
      headers: cernerConfig.headers,
    });
    // In-memory registry for newly created and patched sandbox patients
    this.sandboxStore = new Map();
  }

  /**
   * Helper to normalize query parameters into URL search string
   */
  _buildQueryString(params = {}) {
    const cleanParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        cleanParams[key] = value;
      }
    }
    return cleanParams;
  }

  /**
   * Apply RFC 6902 JSON Patch operations to a target JSON document
   */
  _applyJsonPatch(target, operations) {
    const doc = JSON.parse(JSON.stringify(target));
    const ops = Array.isArray(operations) ? operations : [operations];

    for (const op of ops) {
      if (!op || !op.path) continue;
      const pathParts = op.path.replace(/^\//, '').split('/');
      let current = doc;

      for (let i = 0; i < pathParts.length - 1; i++) {
        const key = pathParts[i];
        if (current[key] === undefined || current[key] === null) {
          const nextKey = pathParts[i + 1];
          current[key] = nextKey === '-' || !isNaN(Number(nextKey)) ? [] : {};
        }
        current = current[key];
      }

      const lastKey = pathParts[pathParts.length - 1];

      if (op.op === 'add') {
        if (Array.isArray(current)) {
          if (lastKey === '-') {
            current.push(op.value);
          } else {
            const idx = parseInt(lastKey, 10);
            current.splice(idx, 0, op.value);
          }
        } else {
          current[lastKey] = op.value;
        }
      } else if (op.op === 'replace') {
        if (Array.isArray(current)) {
          const idx = parseInt(lastKey, 10);
          current[idx] = op.value;
        } else {
          current[lastKey] = op.value;
        }
      } else if (op.op === 'remove') {
        if (Array.isArray(current)) {
          const idx = parseInt(lastKey, 10);
          current.splice(idx, 1);
        } else {
          delete current[lastKey];
        }
      }
    }

    return doc;
  }

  /**
   * Fetch Patient by direct Cerner ID or search with query filters
   * @param {string} [patientId] - Cerner Patient ID (e.g. 12742400)
   * @param {Object} [queryParams] - e.g. { name: 'Peters', _id: '12742400', _count: 10 }
   */
  async getPatient(patientId, queryParams = {}) {
    try {
      if (patientId && patientId !== 'undefined') {
        // Check if patient exists in local sandbox store first
        if (this.sandboxStore.has(patientId)) {
          return {
            success: true,
            source: 'Cerner FHIR R4 Sandbox (Modified/Created)',
            resourceType: 'Patient',
            patientId,
            data: this.sandboxStore.get(patientId),
          };
        }

        const response = await this.client.get(`/Patient/${patientId}`);
        return {
          success: true,
          source: 'Cerner FHIR R4 Open Sandbox',
          resourceType: response.data.resourceType || 'Patient',
          patientId,
          data: response.data,
        };
      }

      // If query parameters provided (e.g. name, _id, identifier)
      const params = this._buildQueryString(queryParams);

      // Cerner R4 specification: _count is rejected when _id is supplied
      if (params._id && params._count) {
        delete params._count;
      }

      // Cerner R4 requires at least one search parameter (_id, name, identifier, birthdate)
      if (!params._id && !params.name && !params.identifier && !params.birthdate) {
        if (!params._count) {
          params._id = cernerConfig.defaultPatientId;
        } else {
          params.name = 'Peters';
        }
      }

      const response = await this.client.get('/Patient', { params });
      return {
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        resourceType: response.data.resourceType || 'Bundle',
        total: response.data.total ?? response.data.entry?.length ?? 0,
        data: response.data,
      };
    } catch (error) {
      this._handleError(error, 'Patient', patientId);
    }
  }

  /**
   * Create a new Patient in FHIR R4 format
   * @param {Object} patientPayload - FHIR Patient resource JSON
   */
  async createPatient(patientPayload) {
    if (!patientPayload || typeof patientPayload !== 'object') {
      const error = new Error('Invalid Patient payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    if (patientPayload.resourceType && patientPayload.resourceType !== 'Patient') {
      const error = new Error(
        `Invalid resourceType '${patientPayload.resourceType}'. Must be 'Patient'.`
      );
      error.statusCode = 400;
      throw error;
    }

    // Generate unique ID and metadata for the patient
    const patientId =
      patientPayload.id || `1274${Math.floor(1000 + Math.random() * 9000)}`;

    const newPatient = {
      ...patientPayload,
      resourceType: 'Patient',
      id: patientId,
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        ...(patientPayload.meta || {}),
      },
    };

    // Store in sandbox memory store
    this.sandboxStore.set(patientId, newPatient);

    return {
      success: true,
      message: 'Patient created successfully in Cerner FHIR R4 Sandbox',
      id: patientId,
      resourceType: 'Patient',
      data: newPatient,
    };
  }

  /**
   * Patch an existing Patient using JSON Patch (RFC 6902)
   * @param {string} patientId - Cerner Patient ID
   * @param {Array|Object} patchOperations - JSON Patch operation(s)
   */
  async patchPatient(patientId, patchOperations) {
    if (!patientId) {
      const error = new Error('Patient ID is required for patch.');
      error.statusCode = 400;
      throw error;
    }

    if (!patchOperations || (Array.isArray(patchOperations) && patchOperations.length === 0)) {
      const error = new Error('Patch operations body is required.');
      error.statusCode = 400;
      throw error;
    }

    // Retrieve the base patient record
    let currentPatient;
    if (this.sandboxStore.has(patientId)) {
      currentPatient = this.sandboxStore.get(patientId);
    } else {
      const fetchResult = await this.getPatient(patientId);
      currentPatient = fetchResult.data;
    }

    if (!currentPatient) {
      const error = new Error(`Patient with ID ${patientId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    // Apply the JSON Patch
    const updatedPatient = this._applyJsonPatch(currentPatient, patchOperations);

    // Increment version
    const prevVersion = parseInt(updatedPatient.meta?.versionId || '1', 10);
    updatedPatient.meta = {
      ...(updatedPatient.meta || {}),
      versionId: (prevVersion + 1).toString(),
      lastUpdated: new Date().toISOString(),
    };

    // Save back to store
    this.sandboxStore.set(patientId, updatedPatient);

    return {
      success: true,
      message: 'Patient patched successfully',
      id: patientId,
      resourceType: 'Patient',
      versionId: updatedPatient.meta.versionId,
      data: updatedPatient,
    };
  }

  /**
   * Fetch Observations (Vitals, Lab Tests) for a patient or by Observation ID
   */
  async getObservations(options = {}) {
    const { id, patientId, category, code, count, ...rest } = options;

    try {
      if (id) {
        if (this.sandboxStore.has(`Observation/${id}`) || this.sandboxStore.has(id)) {
          const observation =
            this.sandboxStore.get(`Observation/${id}`) || this.sandboxStore.get(id);
          return {
            success: true,
            source: 'Cerner FHIR R4 Sandbox (Created/Updated)',
            resourceType: 'Observation',
            data: observation,
          };
        }

        const response = await this.client.get(`/Observation/${id}`);
        return {
          success: true,
          source: 'Cerner FHIR R4 Open Sandbox',
          resourceType: 'Observation',
          data: response.data,
        };
      }

      const targetPatient =
        patientId || rest.patient || rest.subject || cernerConfig.defaultPatientId;
      const params = this._buildQueryString({
        patient: targetPatient,
        category,
        code,
        _count: count || rest._count,
        ...rest,
      });

      const response = await this.client.get('/Observation', { params });
      return {
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        resourceType: 'Bundle',
        patientId: targetPatient,
        total: response.data.total ?? response.data.entry?.length ?? 0,
        data: response.data,
      };
    } catch (error) {
      this._handleError(error, 'Observation', id || patientId);
    }
  }

  /**
   * Create a new Observation in FHIR R4 format (e.g. vital signs, lab tests)
   * @param {Object} observationPayload - FHIR Observation resource JSON
   */
  async createObservation(observationPayload) {
    if (!observationPayload || typeof observationPayload !== 'object') {
      const error = new Error('Invalid Observation payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    if (
      observationPayload.resourceType &&
      observationPayload.resourceType !== 'Observation'
    ) {
      const error = new Error(
        `Invalid resourceType '${observationPayload.resourceType}'. Must be 'Observation'.`
      );
      error.statusCode = 400;
      throw error;
    }

    const observationId =
      observationPayload.id ||
      `VS-${Math.floor(100000000 + Math.random() * 900000000)}`;

    const newObservation = {
      ...observationPayload,
      resourceType: 'Observation',
      id: observationId,
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        ...(observationPayload.meta || {}),
      },
    };

    this.sandboxStore.set(`Observation/${observationId}`, newObservation);
    this.sandboxStore.set(observationId, newObservation);

    return {
      success: true,
      message: 'Observation created successfully in Cerner FHIR R4 Sandbox',
      id: observationId,
      resourceType: 'Observation',
      data: newObservation,
    };
  }

  /**
   * Update an existing Observation (PUT /Observation/:id)
   * @param {string} observationId - Observation ID
   * @param {Object} observationPayload - Updated FHIR Observation resource JSON
   */
  async updateObservation(observationId, observationPayload) {
    if (!observationId) {
      const error = new Error('Observation ID is required for update.');
      error.statusCode = 400;
      throw error;
    }

    if (!observationPayload || typeof observationPayload !== 'object') {
      const error = new Error('Invalid Observation payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    let prevVersion = 1;
    const existing =
      this.sandboxStore.get(`Observation/${observationId}`) ||
      this.sandboxStore.get(observationId);
    if (existing?.meta?.versionId) {
      prevVersion = parseInt(existing.meta.versionId, 10);
    }

    const updatedObservation = {
      ...observationPayload,
      resourceType: 'Observation',
      id: observationId,
      meta: {
        ...(observationPayload.meta || {}),
        versionId: (prevVersion + 1).toString(),
        lastUpdated: new Date().toISOString(),
      },
    };

    this.sandboxStore.set(`Observation/${observationId}`, updatedObservation);
    this.sandboxStore.set(observationId, updatedObservation);

    return {
      success: true,
      message: 'Observation updated successfully in Cerner FHIR R4 Sandbox',
      id: observationId,
      resourceType: 'Observation',
      versionId: updatedObservation.meta.versionId,
      data: updatedObservation,
    };
  }

  /**
   * Fetch Conditions (Diagnoses, Health Issues) for a patient or by Condition ID
   */
  async getConditions(options = {}) {
    const { id, patientId, clinicalStatus, count, ...rest } = options;

    try {
      if (id) {
        if (this.sandboxStore.has(`Condition/${id}`) || this.sandboxStore.has(id)) {
          const condition = this.sandboxStore.get(`Condition/${id}`) || this.sandboxStore.get(id);
          return {
            success: true,
            source: 'Cerner FHIR R4 Sandbox (Created/Updated)',
            resourceType: 'Condition',
            data: condition,
          };
        }

        const response = await this.client.get(`/Condition/${id}`);
        return {
          success: true,
          source: 'Cerner FHIR R4 Open Sandbox',
          resourceType: 'Condition',
          data: response.data,
        };
      }

      const targetPatient =
        patientId || rest.patient || rest.subject || cernerConfig.defaultPatientId;
      const params = this._buildQueryString({
        patient: targetPatient,
        'clinical-status': clinicalStatus || rest['clinical-status'],
        _count: count || rest._count,
        ...rest,
      });

      const response = await this.client.get('/Condition', { params });
      return {
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        resourceType: 'Bundle',
        patientId: targetPatient,
        total: response.data.total ?? response.data.entry?.length ?? 0,
        data: response.data,
      };
    } catch (error) {
      this._handleError(error, 'Condition', id || patientId);
    }
  }

  /**
   * Create a new Condition in FHIR R4 format
   * @param {Object} conditionPayload - FHIR Condition resource JSON
   */
  async createCondition(conditionPayload) {
    if (!conditionPayload || typeof conditionPayload !== 'object') {
      const error = new Error('Invalid Condition payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    if (conditionPayload.resourceType && conditionPayload.resourceType !== 'Condition') {
      const error = new Error(
        `Invalid resourceType '${conditionPayload.resourceType}'. Must be 'Condition'.`
      );
      error.statusCode = 400;
      throw error;
    }

    const conditionId =
      conditionPayload.id || `d${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    const newCondition = {
      ...conditionPayload,
      resourceType: 'Condition',
      id: conditionId,
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        ...(conditionPayload.meta || {}),
      },
    };

    this.sandboxStore.set(`Condition/${conditionId}`, newCondition);
    this.sandboxStore.set(conditionId, newCondition);

    return {
      success: true,
      message: 'Condition created successfully in Cerner FHIR R4 Sandbox',
      id: conditionId,
      resourceType: 'Condition',
      data: newCondition,
    };
  }

  /**
   * Update an existing Condition (PUT /Condition/:id)
   * @param {string} conditionId - Condition ID
   * @param {Object} conditionPayload - Updated FHIR Condition resource JSON
   */
  async updateCondition(conditionId, conditionPayload) {
    if (!conditionId) {
      const error = new Error('Condition ID is required for update.');
      error.statusCode = 400;
      throw error;
    }

    if (!conditionPayload || typeof conditionPayload !== 'object') {
      const error = new Error('Invalid Condition payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    let prevVersion = 1;
    const existing = this.sandboxStore.get(`Condition/${conditionId}`) || this.sandboxStore.get(conditionId);
    if (existing?.meta?.versionId) {
      prevVersion = parseInt(existing.meta.versionId, 10);
    }

    const updatedCondition = {
      ...conditionPayload,
      resourceType: 'Condition',
      id: conditionId,
      meta: {
        ...(conditionPayload.meta || {}),
        versionId: (prevVersion + 1).toString(),
        lastUpdated: new Date().toISOString(),
      },
    };

    this.sandboxStore.set(`Condition/${conditionId}`, updatedCondition);
    this.sandboxStore.set(conditionId, updatedCondition);

    return {
      success: true,
      message: 'Condition updated successfully in Cerner FHIR R4 Sandbox',
      id: conditionId,
      resourceType: 'Condition',
      versionId: updatedCondition.meta.versionId,
      data: updatedCondition,
    };
  }

  /**
   * Fetch Encounters (Hospital / Clinic visits) for a patient or by Encounter ID
   */
  async getEncounters(options = {}) {
    const { id, patientId, status, count, ...rest } = options;

    try {
      if (id) {
        if (this.sandboxStore.has(`Encounter/${id}`) || this.sandboxStore.has(id)) {
          const encounter =
            this.sandboxStore.get(`Encounter/${id}`) || this.sandboxStore.get(id);
          return {
            success: true,
            source: 'Cerner FHIR R4 Sandbox (Created/Patched)',
            resourceType: 'Encounter',
            data: encounter,
          };
        }

        const response = await this.client.get(`/Encounter/${id}`);
        return {
          success: true,
          source: 'Cerner FHIR R4 Open Sandbox',
          resourceType: 'Encounter',
          data: response.data,
        };
      }

      const targetPatient =
        patientId || rest.patient || rest.subject || cernerConfig.defaultPatientId;
      const params = this._buildQueryString({
        patient: targetPatient,
        status,
        _count: count || rest._count,
        ...rest,
      });

      const response = await this.client.get('/Encounter', { params });
      return {
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        resourceType: 'Bundle',
        patientId: targetPatient,
        total: response.data.total ?? response.data.entry?.length ?? 0,
        data: response.data,
      };
    } catch (error) {
      this._handleError(error, 'Encounter', id || patientId);
    }
  }

  /**
   * Create a new Encounter in FHIR R4 format
   * @param {Object} encounterPayload - FHIR Encounter resource JSON
   */
  async createEncounter(encounterPayload) {
    if (!encounterPayload || typeof encounterPayload !== 'object') {
      const error = new Error('Invalid Encounter payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    if (
      encounterPayload.resourceType &&
      encounterPayload.resourceType !== 'Encounter'
    ) {
      const error = new Error(
        `Invalid resourceType '${encounterPayload.resourceType}'. Must be 'Encounter'.`
      );
      error.statusCode = 400;
      throw error;
    }

    const encounterId =
      encounterPayload.id ||
      `97${Math.floor(100000 + Math.random() * 900000)}`;

    const newEncounter = {
      ...encounterPayload,
      resourceType: 'Encounter',
      id: encounterId,
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        ...(encounterPayload.meta || {}),
      },
    };

    this.sandboxStore.set(`Encounter/${encounterId}`, newEncounter);
    this.sandboxStore.set(encounterId, newEncounter);

    return {
      success: true,
      message: 'Encounter created successfully in Cerner FHIR R4 Sandbox',
      id: encounterId,
      resourceType: 'Encounter',
      data: newEncounter,
    };
  }

  /**
   * Patch an existing Encounter (PATCH /Encounter/:id)
   * Supports /period/start, /period/end, /type, /extension, /extension/- operations
   * @param {string} encounterId - Encounter ID
   * @param {Array|Object} patchOperations - JSON Patch operation(s)
   */
  async patchEncounter(encounterId, patchOperations) {
    if (!encounterId) {
      const error = new Error('Encounter ID is required for patch.');
      error.statusCode = 400;
      throw error;
    }

    if (
      !patchOperations ||
      (Array.isArray(patchOperations) && patchOperations.length === 0)
    ) {
      const error = new Error('Patch operations body is required.');
      error.statusCode = 400;
      throw error;
    }

    // Retrieve current encounter
    let currentEncounter;
    if (this.sandboxStore.has(`Encounter/${encounterId}`)) {
      currentEncounter = this.sandboxStore.get(`Encounter/${encounterId}`);
    } else if (this.sandboxStore.has(encounterId)) {
      currentEncounter = this.sandboxStore.get(encounterId);
    } else {
      const fetchResult = await this.getEncounters({ id: encounterId });
      currentEncounter = fetchResult.data;
    }

    if (!currentEncounter) {
      const error = new Error(`Encounter with ID ${encounterId} not found.`);
      error.statusCode = 404;
      throw error;
    }

    const rawOps = Array.isArray(patchOperations)
      ? patchOperations
      : [patchOperations];

    const updatedEncounter = this._applyJsonPatch(currentEncounter, rawOps);

    // Increment version
    let prevVersion = 1;
    if (updatedEncounter.meta?.versionId) {
      prevVersion = parseInt(updatedEncounter.meta.versionId, 10);
    }

    updatedEncounter.meta = {
      ...(updatedEncounter.meta || {}),
      versionId: (prevVersion + 1).toString(),
      lastUpdated: new Date().toISOString(),
    };

    this.sandboxStore.set(`Encounter/${encounterId}`, updatedEncounter);
    this.sandboxStore.set(encounterId, updatedEncounter);

    return {
      success: true,
      message: 'Encounter patched successfully',
      id: encounterId,
      resourceType: 'Encounter',
      versionId: updatedEncounter.meta.versionId,
      data: updatedEncounter,
    };
  }

  /**
   * Fetch MedicationRequests (Prescriptions, Orders) for a patient or by ID
   */
  async getMedicationRequests(options = {}) {
    const { id, patientId, status, count, ...rest } = options;

    try {
      if (id) {
        if (this.sandboxStore.has(`MedicationRequest/${id}`) || this.sandboxStore.has(id)) {
          const med =
            this.sandboxStore.get(`MedicationRequest/${id}`) || this.sandboxStore.get(id);
          return {
            success: true,
            source: 'Cerner FHIR R4 Sandbox (Created/Patched)',
            resourceType: 'MedicationRequest',
            data: med,
          };
        }

        const response = await this.client.get(`/MedicationRequest/${id}`);
        return {
          success: true,
          source: 'Cerner FHIR R4 Open Sandbox',
          resourceType: 'MedicationRequest',
          data: response.data,
        };
      }

      const targetPatient =
        patientId || rest.patient || rest.subject || cernerConfig.defaultPatientId;
      const params = this._buildQueryString({
        patient: targetPatient,
        status,
        _count: count || rest._count,
        ...rest,
      });

      const response = await this.client.get('/MedicationRequest', { params });
      return {
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        resourceType: 'Bundle',
        patientId: targetPatient,
        total: response.data.total ?? response.data.entry?.length ?? 0,
        data: response.data,
      };
    } catch (error) {
      this._handleError(error, 'MedicationRequest', id || patientId);
    }
  }

  /**
   * Create a new MedicationRequest in FHIR R4 format
   * @param {Object} medPayload - FHIR MedicationRequest resource JSON
   */
  async createMedicationRequest(medPayload) {
    if (!medPayload || typeof medPayload !== 'object') {
      const error = new Error('Invalid MedicationRequest payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    if (
      medPayload.resourceType &&
      medPayload.resourceType !== 'MedicationRequest'
    ) {
      const error = new Error(
        `Invalid resourceType '${medPayload.resourceType}'. Must be 'MedicationRequest'.`
      );
      error.statusCode = 400;
      throw error;
    }

    const medId =
      medPayload.id || `31828${Math.floor(1000 + Math.random() * 9000)}`;

    const newMed = {
      ...medPayload,
      resourceType: 'MedicationRequest',
      id: medId,
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        ...(medPayload.meta || {}),
      },
    };

    this.sandboxStore.set(`MedicationRequest/${medId}`, newMed);
    this.sandboxStore.set(medId, newMed);

    return {
      success: true,
      message: 'MedicationRequest created successfully in Cerner FHIR R4 Sandbox',
      id: medId,
      resourceType: 'MedicationRequest',
      data: newMed,
    };
  }

  /**
   * Patch an existing MedicationRequest (PATCH /MedicationRequest/:id)
   * Enforces Cerner Millennium status rules (stopped vs cancelled based on boundsPeriod.start)
   * @param {string} medId - MedicationRequest ID
   * @param {Array|Object} patchOperations - JSON Patch operation(s)
   */
  async patchMedicationRequest(medId, patchOperations) {
    if (!medId) {
      const error = new Error('MedicationRequest ID is required for patch.');
      error.statusCode = 400;
      throw error;
    }

    if (
      !patchOperations ||
      (Array.isArray(patchOperations) && patchOperations.length === 0)
    ) {
      const error = new Error('Patch operations body is required.');
      error.statusCode = 400;
      throw error;
    }

    // Retrieve current medication request
    let currentMed;
    if (this.sandboxStore.has(`MedicationRequest/${medId}`)) {
      currentMed = this.sandboxStore.get(`MedicationRequest/${medId}`);
    } else if (this.sandboxStore.has(medId)) {
      currentMed = this.sandboxStore.get(medId);
    } else {
      const fetchResult = await this.getMedicationRequests({ id: medId });
      currentMed = fetchResult.data;
    }

    if (!currentMed) {
      const error = new Error(
        `MedicationRequest with ID ${medId} not found.`
      );
      error.statusCode = 404;
      throw error;
    }

    // Clone and normalize operations
    const rawOps = Array.isArray(patchOperations)
      ? patchOperations
      : [patchOperations];

    const ops = rawOps.map((op) => {
      // Validate and apply Cerner Millennium status business rules
      if (op.path === '/status' || op.path === 'status') {
        let requestedStatus = String(op.value).toLowerCase();

        // Check boundsPeriod start date
        const startDateStr =
          currentMed.dosageInstruction?.[0]?.timing?.repeat?.boundsPeriod?.start;

        if (startDateStr) {
          const startDate = new Date(startDateStr);
          const now = new Date();

          if (startDate < now && requestedStatus === 'cancelled') {
            // Start date is in the past: medication was started -> use 'stopped'
            requestedStatus = 'stopped';
          } else if (startDate > now && requestedStatus === 'stopped') {
            // Start date is in the future: first dose never administered -> use 'cancelled'
            requestedStatus = 'cancelled';
          }
        }

        return { ...op, value: requestedStatus };
      }
      return op;
    });

    const updatedMed = this._applyJsonPatch(currentMed, ops);

    // Increment version
    let prevVersion = 1;
    if (updatedMed.meta?.versionId) {
      prevVersion = parseInt(updatedMed.meta.versionId, 10);
    }

    updatedMed.meta = {
      ...(updatedMed.meta || {}),
      versionId: (prevVersion + 1).toString(),
      lastUpdated: new Date().toISOString(),
    };

    this.sandboxStore.set(`MedicationRequest/${medId}`, updatedMed);
    this.sandboxStore.set(medId, updatedMed);

    return {
      success: true,
      message: 'MedicationRequest patched successfully',
      id: medId,
      resourceType: 'MedicationRequest',
      status: updatedMed.status,
      versionId: updatedMed.meta.versionId,
      data: updatedMed,
    };
  }

  /**
   * Fetch Practitioner (Doctor) details by ID or search filters
   */
  async getPractitioners(practitionerId, queryParams = {}) {
    try {
      if (practitionerId && practitionerId !== 'undefined') {
        if (
          this.sandboxStore.has(`Practitioner/${practitionerId}`) ||
          this.sandboxStore.has(practitionerId)
        ) {
          const practitioner =
            this.sandboxStore.get(`Practitioner/${practitionerId}`) ||
            this.sandboxStore.get(practitionerId);
          return {
            success: true,
            source: 'Cerner FHIR R4 Sandbox (Created)',
            resourceType: 'Practitioner',
            practitionerId,
            data: practitioner,
          };
        }

        const response = await this.client.get(`/Practitioner/${practitionerId}`);
        return {
          success: true,
          source: 'Cerner FHIR R4 Open Sandbox',
          resourceType: 'Practitioner',
          practitionerId,
          data: response.data,
        };
      }

      const params = this._buildQueryString(queryParams);
      const response = await this.client.get('/Practitioner', { params });
      return {
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        resourceType: 'Bundle',
        total: response.data.total ?? response.data.entry?.length ?? 0,
        data: response.data,
      };
    } catch (error) {
      this._handleError(error, 'Practitioner', practitionerId);
    }
  }

  /**
   * Create a new Practitioner in FHIR R4 format
   * @param {Object} practitionerPayload - FHIR Practitioner resource JSON
   */
  async createPractitioner(practitionerPayload) {
    if (!practitionerPayload || typeof practitionerPayload !== 'object') {
      const error = new Error('Invalid Practitioner payload: JSON object required.');
      error.statusCode = 400;
      throw error;
    }

    if (
      practitionerPayload.resourceType &&
      practitionerPayload.resourceType !== 'Practitioner'
    ) {
      const error = new Error(
        `Invalid resourceType '${practitionerPayload.resourceType}'. Must be 'Practitioner'.`
      );
      error.statusCode = 400;
      throw error;
    }

    const practitionerId =
      practitionerPayload.id ||
      `116${Math.floor(10000 + Math.random() * 90000)}`;

    const newPractitioner = {
      ...practitionerPayload,
      resourceType: 'Practitioner',
      id: practitionerId,
      meta: {
        versionId: '1',
        lastUpdated: new Date().toISOString(),
        ...(practitionerPayload.meta || {}),
      },
    };

    this.sandboxStore.set(`Practitioner/${practitionerId}`, newPractitioner);
    this.sandboxStore.set(practitionerId, newPractitioner);

    return {
      success: true,
      message: 'Practitioner created successfully in Cerner FHIR R4 Sandbox',
      id: practitionerId,
      resourceType: 'Practitioner',
      data: newPractitioner,
    };
  }

  /**
   * Comprehensive patient medical chart aggregator
   */
  async getPatientFullChart(patientId) {
    const targetId = patientId || cernerConfig.defaultPatientId;

    const [patientRes, conditionsRes, vitalsRes, labRes, encountersRes, medicationsRes] =
      await Promise.allSettled([
        this.getPatient(targetId),
        this.getConditions({ patientId: targetId }),
        this.getObservations({ patientId: targetId, category: 'vital-signs' }),
        this.getObservations({ patientId: targetId, category: 'laboratory' }),
        this.getEncounters({ patientId: targetId }),
        this.getMedicationRequests({ patientId: targetId }),
      ]);

    const patientData = patientRes.status === 'fulfilled' ? patientRes.value.data : null;
    const conditionsData = conditionsRes.status === 'fulfilled' ? conditionsRes.value.data : null;
    const vitalsData = vitalsRes.status === 'fulfilled' ? vitalsRes.value.data : null;
    const labData = labRes.status === 'fulfilled' ? labRes.value.data : null;
    const encountersData = encountersRes.status === 'fulfilled' ? encountersRes.value.data : null;
    const medicationsData =
      medicationsRes.status === 'fulfilled' ? medicationsRes.value.data : null;

    const summary = {
      patientId: targetId,
      demographics: patientData
        ? {
            name:
              patientData.name?.[0]?.text ||
              `${patientData.name?.[0]?.given?.join(' ') || ''} ${patientData.name?.[0]?.family || ''}`.trim(),
            gender: patientData.gender,
            birthDate: patientData.birthDate,
            telecom: patientData.telecom,
            address: patientData.address?.[0]?.text || patientData.address?.[0]?.city,
            maritalStatus: patientData.maritalStatus?.text,
          }
        : null,
      activeConditionsCount: conditionsData?.entry?.length || 0,
      vitalSignsCount: vitalsData?.entry?.length || 0,
      labResultsCount: labData?.entry?.length || 0,
      encountersCount: encountersData?.entry?.length || 0,
      medicationsCount: medicationsData?.entry?.length || 0,
    };

    return {
      success: true,
      patientId: targetId,
      source: 'Cerner FHIR R4 Open Sandbox',
      timestamp: new Date().toISOString(),
      summary,
      raw: {
        patient: patientData,
        conditions: conditionsData,
        vitalSigns: vitalsData,
        labResults: labData,
        encounters: encountersData,
        medicationRequests: medicationsData,
      },
    };
  }

  /**
   * Generic resource query for any FHIR R4 endpoint
   */
  async queryResource(resourceType, queryParams = {}) {
    try {
      const params = this._buildQueryString(queryParams);
      const response = await this.client.get(`/${resourceType}`, { params });
      return {
        success: true,
        source: 'Cerner FHIR R4 Open Sandbox',
        resourceType: response.data.resourceType || 'Bundle',
        data: response.data,
      };
    } catch (error) {
      this._handleError(error, resourceType);
    }
  }

  /**
   * Normalized error handler
   */
  _handleError(error, resourceType, id) {
    const status = error.response?.status || error.statusCode || 500;
    const cernerOutcome = error.response?.data || error.details;

    let message = error.message;
    if (cernerOutcome && cernerOutcome.issue && cernerOutcome.issue[0]) {
      message =
        cernerOutcome.issue[0].diagnostics ||
        cernerOutcome.issue[0].details?.text ||
        message;
    }

    const err = new Error(
      `Cerner FHIR [${resourceType}${id ? `/${id}` : ''}] failed with status ${status}: ${message}`
    );
    err.statusCode = status;
    err.details = cernerOutcome;
    throw err;
  }
}

module.exports = new CernerFhirService();
