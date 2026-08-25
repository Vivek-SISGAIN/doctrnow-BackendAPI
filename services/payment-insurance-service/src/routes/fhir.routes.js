const express = require('express');
const fhirController = require('../controllers/fhir.controller');

const router = express.Router();

/**
 * @swagger
 * /api/fhir/sandbox-patients:
 *   get:
 *     summary: List known test patients in the Cerner Sandbox
 *     tags: [Cerner FHIR]
 *     responses:
 *       200:
 *         description: List of test patients
 */
router.get('/sandbox-patients', fhirController.getKnownPatients);

/**
 * @swagger
 * /api/fhir/patient-summary/{id}:
 *   get:
 *     summary: Get comprehensive medical chart summary for a patient (Patient + Conditions + Vitals + Labs + Encounters + Medications)
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           default: "12742400"
 *         description: Cerner Patient ID
 *     responses:
 *       200:
 *         description: Consolidated patient medical chart
 */
router.get('/patient-summary/:id', fhirController.getPatientSummary);

/**
 * @swagger
 * /api/fhir/Patient:
 *   get:
 *     summary: Search Patients in Cerner FHIR R4
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: query
 *         name: _id
 *         schema:
 *           type: string
 *         description: Patient ID (e.g. 12742400)
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Patient family or given name (e.g. Peters)
 *       - in: query
 *         name: _count
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Max number of search results
 *     responses:
 *       200:
 *         description: FHIR Patient Bundle
 */
router.get('/Patient', fhirController.getPatients);

/**
 * @swagger
 * /api/fhir/Patient/{id}:
 *   get:
 *     summary: Get Patient by Cerner ID
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           default: "12742400"
 *         description: Cerner Patient ID
 *     responses:
 *       200:
 *         description: FHIR Patient Resource
 */
router.get('/Patient/:id', fhirController.getPatientById);

/**
 * @swagger
 * /api/fhir/Patient:
 *   post:
 *     summary: Create a new Patient in Cerner FHIR R4 format
 *     tags: [Cerner FHIR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceType, name, gender, birthDate]
 *             example:
 *               resourceType: "Patient"
 *               name:
 *                 - use: "official"
 *                   family: "Wolf"
 *                   given: ["Person", "Name"]
 *               gender: "male"
 *               birthDate: "1990-09-15"
 *     responses:
 *       201:
 *         description: Patient created successfully
 */
router.post('/Patient', fhirController.createPatient);

/**
 * @swagger
 * /api/fhir/Patient/{id}:
 *   patch:
 *     summary: Patch a Patient using JSON Patch (RFC 6902)
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           default: "12742400"
 *         description: Cerner Patient ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 op:
 *                   type: string
 *                   enum: [add, replace, remove]
 *                 path:
 *                   type: string
 *                 value:
 *                   type: object
 *             example:
 *               - op: "add"
 *                 path: "/identifier/-"
 *                 value:
 *                   system: "urn:oid:1.1.1.1.1.1"
 *                   value: "DOC-998877"
 *     responses:
 *       200:
 *         description: Patient patched successfully
 */
router.patch('/Patient/:id', fhirController.patchPatient);

/**
 * @swagger
 * /api/fhir/Observation:
 *   get:
 *     summary: Get Observations (Vitals, Lab Results)
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: query
 *         name: patient
 *         schema:
 *           type: string
 *           default: "12742400"
 *         description: Cerner Patient ID
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [vital-signs, laboratory]
 *         description: Observation category
 *       - in: query
 *         name: _count
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: FHIR Observation Bundle
 */
router.get('/Observation', fhirController.getObservations);

/**
 * @swagger
 * /api/fhir/Observation/{id}:
 *   get:
 *     summary: Get Observation by ID
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FHIR Observation Resource
 */
router.get('/Observation/:id', fhirController.getObservationById);

/**
 * @swagger
 * /api/fhir/Observation:
 *   post:
 *     summary: Create a new Observation in Cerner FHIR R4 format (e.g. vital signs, lab tests)
 *     tags: [Cerner FHIR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceType, status, code, subject]
 *     responses:
 *       201:
 *         description: Observation created successfully
 */
router.post('/Observation', fhirController.createObservation);

/**
 * @swagger
 * /api/fhir/Observation/{id}:
 *   put:
 *     summary: Update an existing Observation in Cerner FHIR R4 format
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "VS-197356031"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Observation updated successfully
 */
router.put('/Observation/:id', fhirController.updateObservation);

/**
 * @swagger
 * /api/fhir/Condition:
 *   get:
 *     summary: Get Conditions (Diagnoses / Health Problems)
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: query
 *         name: patient
 *         schema:
 *           type: string
 *           default: "12742400"
 *         description: Cerner Patient ID
 *       - in: query
 *         name: clinical-status
 *         schema:
 *           type: string
 *         description: Clinical status (e.g. active, resolved)
 *       - in: query
 *         name: _count
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: FHIR Condition Bundle
 */
router.get('/Condition', fhirController.getConditions);

/**
 * @swagger
 * /api/fhir/Condition/{id}:
 *   get:
 *     summary: Get Condition by ID
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FHIR Condition Resource
 */
router.get('/Condition/:id', fhirController.getConditionById);

/**
 * @swagger
 * /api/fhir/Condition:
 *   post:
 *     summary: Create a new Condition in Cerner FHIR R4 format
 *     tags: [Cerner FHIR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceType, subject, code, clinicalStatus]
 *     responses:
 *       201:
 *         description: Condition created successfully
 */
router.post('/Condition', fhirController.createCondition);

/**
 * @swagger
 * /api/fhir/Condition/{id}:
 *   put:
 *     summary: Update an existing Condition in Cerner FHIR R4 format
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "d2593255383"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Condition updated successfully
 */
router.put('/Condition/:id', fhirController.updateCondition);

/**
 * @swagger
 * /api/fhir/Encounter:
 *   get:
 *     summary: Get Encounters (Hospital Visits / Appointments)
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: query
 *         name: patient
 *         schema:
 *           type: string
 *           default: "12742400"
 *         description: Cerner Patient ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: _count
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: FHIR Encounter Bundle
 */
router.get('/Encounter', fhirController.getEncounters);

/**
 * @swagger
 * /api/fhir/Encounter/{id}:
 *   get:
 *     summary: Get Encounter by ID
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FHIR Encounter Resource
 */
router.get('/Encounter/:id', fhirController.getEncounterById);

/**
 * @swagger
 * /api/fhir/Encounter:
 *   post:
 *     summary: Create a new Encounter in Cerner FHIR R4 format
 *     tags: [Cerner FHIR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceType, status, subject]
 *     responses:
 *       201:
 *         description: Encounter created successfully
 */
router.post('/Encounter', fhirController.createEncounter);

/**
 * @swagger
 * /api/fhir/Encounter/{id}:
 *   patch:
 *     summary: Patch an Encounter by ID (supports period, type, extension, custom-attributes)
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 op:
 *                   type: string
 *                   example: "replace"
 *                 path:
 *                   type: string
 *                   example: "/period/start"
 *                 value:
 *                   type: string
 *                   example: "2015-09-01T00:00:00.000Z"
 *     responses:
 *       200:
 *         description: Encounter patched successfully
 */
router.patch('/Encounter/:id', fhirController.patchEncounter);

/**
 * @swagger
 * /api/fhir/MedicationRequest:
 *   get:
 *     summary: Get Medication Requests (Prescriptions / Medication Orders)
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: query
 *         name: patient
 *         schema:
 *           type: string
 *           default: "12742400"
 *         description: Cerner Patient ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: _count
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: FHIR MedicationRequest Bundle
 */
router.get('/MedicationRequest', fhirController.getMedicationRequests);

/**
 * @swagger
 * /api/fhir/MedicationRequest/{id}:
 *   get:
 *     summary: Get MedicationRequest by ID
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FHIR MedicationRequest Resource
 */
router.get('/MedicationRequest/:id', fhirController.getMedicationRequestById);

/**
 * @swagger
 * /api/fhir/MedicationRequest:
 *   post:
 *     summary: Create a new MedicationRequest in Cerner FHIR R4 format
 *     tags: [Cerner FHIR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceType, status, intent, subject]
 *     responses:
 *       201:
 *         description: MedicationRequest created successfully
 */
router.post('/MedicationRequest', fhirController.createMedicationRequest);

/**
 * @swagger
 * /api/fhir/MedicationRequest/{id}:
 *   patch:
 *     summary: Patch MedicationRequest status (stopped / cancelled) per Cerner Millennium rules
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 op:
 *                   type: string
 *                   example: "replace"
 *                 path:
 *                   type: string
 *                   example: "/status"
 *                 value:
 *                   type: string
 *                   example: "stopped"
 *     responses:
 *       200:
 *         description: MedicationRequest patched successfully
 */
router.patch('/MedicationRequest/:id', fhirController.patchMedicationRequest);

/**
 * @swagger
 * /api/fhir/Practitioner:
 *   get:
 *     summary: Get Practitioner (Doctor) search
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: query
 *         name: _id
 *         schema:
 *           type: string
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FHIR Practitioner Bundle
 */
router.get('/Practitioner', fhirController.getPractitioners);

/**
 * @swagger
 * /api/fhir/Practitioner/{id}:
 *   get:
 *     summary: Get Practitioner by ID
 *     tags: [Cerner FHIR]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FHIR Practitioner Resource
 */
router.get('/Practitioner/:id', fhirController.getPractitionerById);

/**
 * @swagger
 * /api/fhir/Practitioner:
 *   post:
 *     summary: Create a new Practitioner in Cerner FHIR R4 format
 *     tags: [Cerner FHIR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resourceType, name]
 *     responses:
 *       201:
 *         description: Practitioner created successfully
 */
router.post('/Practitioner', fhirController.createPractitioner);

module.exports = router;
