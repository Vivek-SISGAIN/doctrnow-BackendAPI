# 🩺 Cerner FHIR R4 API Guide for Frontend Developers

Welcome to the **DoctorNow Cerner FHIR R4 Integration Guide**. This document outlines how frontend applications (Hospital Admin Portal, Patient Portal, Doctor Portal, and Mobile Apps) can interact with electronic health record (EHR) resources conforming to the **HL7 FHIR R4 specification**.

---

## 🌐 Environments & Base URLs

| Gateway / Service | Base URL | Notes |
| :--- | :--- | :--- |
| **API Gateway (Recommended)** | `http://localhost:8080/api/v1/fhir` | Proxied through Gateway with JWT authentication |
| **Direct Microservice** | `http://localhost:3006/api/fhir` or `http://localhost:3006` | Direct payment-insurance microservice |
| **Interactive Swagger UI** | `http://localhost:3006/api-docs` | Interactive OpenAPI documentation & live test console |

---

## 📑 Required Headers

```http
Content-Type: application/json
Accept: application/fhir+json, application/json
Authorization: Bearer <YOUR_JWT_TOKEN>  # Required when calling via API Gateway
```

---

## 🧪 Curated Sandbox Test IDs

For quick testing without creating resources, use these pre-populated Cerner Sandbox Patient IDs:

| Patient ID | Name | Sample Available Data |
| :--- | :--- | :--- |
| `12742400` *(Default)* | **Peters, Tim** | Observations (vitals/labs), Conditions, Encounters, Medications |
| `12724066` | **Smart, Joe** | Encounters, Problem lists, Vitals |
| `12457981` | **Williams, Nancy** | Temperature Oral, Vitals |
| `12712400` | **Fredrickson, Jane** | Demographic Profile |

> **Tip:** You can fetch all active sandbox patient IDs at `GET /api/fhir/sandbox-patients`.

---

## 📦 Resource Endpoints & Payload Formats

---

### 1. Patient (`/Patient`)

#### A. List / Search Patients
- **Endpoint:** `GET /Patient` or `GET /api/fhir/Patient`
- **Query Parameters:**
  - `name`: Filter by patient family or given name (e.g. `?name=Peters`)
  - `_count`: Number of records to return (e.g. `?_count=10`)
  - `gender`: `male` | `female` | `other` | `unknown`
  - `birthdate`: `YYYY-MM-DD`
- **Example Response:**
```json
{
  "success": true,
  "resourceType": "Bundle",
  "total": 10,
  "data": {
    "resourceType": "Bundle",
    "type": "searchset",
    "entry": [
      {
        "resource": {
          "resourceType": "Patient",
          "id": "12742400",
          "name": [{ "use": "official", "family": "Peters", "given": ["Tim", "A"] }],
          "gender": "male",
          "birthDate": "1960-05-12"
        }
      }
    ]
  }
}
```

#### B. Get Patient by ID
- **Endpoint:** `GET /Patient/:id` (e.g. `GET /Patient/12742400`)

#### C. Create Patient
- **Endpoint:** `POST /Patient`
- **Status:** `201 Created`
- **Payload:**
```json
{
  "resourceType": "Patient",
  "name": [
    {
      "use": "official",
      "family": "Wolf",
      "given": ["Person", "Name"]
    }
  ],
  "gender": "male",
  "birthDate": "1990-09-15",
  "address": [
    {
      "use": "home",
      "line": ["121212 Metcalf Drive", "Apartment 403"],
      "city": "Kansas City",
      "state": "KS",
      "postalCode": "64199",
      "country": "USA"
    }
  ]
}
```

#### D. Patch Patient (JSON Patch RFC 6902)
- **Endpoint:** `PATCH /Patient/:id`
- **Payload:**
```json
[
  {
    "op": "add",
    "path": "/identifier/-",
    "value": {
      "type": { "coding": [{ "code": "MR", "system": "http://hl7.org/fhir/v2/0203" }] },
      "system": "urn:oid:1.1.1.1.1.1",
      "value": "MRN-998877"
    }
  }
]
```

---

### 2. Observations (Vitals & Labs) (`/Observation`)

#### A. Query Observations
- **Endpoint:** `GET /Observation`
- **Query Parameters:**
  - `patient`: Patient ID (e.g. `?patient=12742400`)
  - `category`: `vital-signs` or `laboratory`
  - `_count`: Limit count (e.g. `10`)

#### B. Get Observation by ID
- **Endpoint:** `GET /Observation/:id`

#### C. Create Observation (e.g. Temperature / Vital Sign)
- **Endpoint:** `POST /Observation`
- **Status:** `201 Created`
- **Payload:**
```json
{
  "resourceType": "Observation",
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "vital-signs",
          "display": "Vital Signs"
        }
      ]
    }
  ],
  "code": {
    "coding": [{ "system": "http://loinc.org", "code": "8331-1" }],
    "text": "Temperature Oral"
  },
  "subject": { "reference": "Patient/12457981" },
  "effectiveDateTime": "2026-08-26T10:00:00.000Z",
  "valueQuantity": {
    "value": 37.2,
    "unit": "degC",
    "system": "http://unitsofmeasure.org",
    "code": "Cel"
  }
}
```

#### D. Update Observation (Correction / Status change)
- **Endpoint:** `PUT /Observation/:id`
- **Payload:** Full updated Observation JSON with modified fields and `status: "corrected"`.

---

### 3. Conditions (Diagnoses & Problems) (`/Condition`)

#### A. Query Conditions
- **Endpoint:** `GET /Condition`
- **Query Parameters:**
  - `patient`: Patient ID (e.g. `?patient=12742400`)
  - `clinical-status`: `active` | `recurrence` | `relapse` | `inactive` | `remission` | `resolved`

#### B. Get Condition by ID
- **Endpoint:** `GET /Condition/:id`

#### C. Create Condition (Add Diagnosis)
- **Endpoint:** `POST /Condition`
- **Status:** `201 Created`
- **Payload:**
```json
{
  "resourceType": "Condition",
  "clinicalStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
        "code": "active",
        "display": "Active"
      }
    ],
    "text": "Active"
  },
  "code": {
    "coding": [
      {
        "system": "http://snomed.info/sct",
        "code": "1137438000",
        "display": "Pain due to arthritis"
      }
    ],
    "text": "Pain due to arthritis"
  },
  "severity": {
    "coding": [{ "system": "http://snomed.info/sct", "code": "255604002", "display": "Mild" }]
  },
  "subject": { "reference": "Patient/13034092" },
  "onsetDateTime": "2026-08-26T00:00:00Z"
}
```

#### D. Update Condition
- **Endpoint:** `PUT /Condition/:id`
- **Payload:** Full updated Condition JSON (e.g. resolving a condition with `clinicalStatus.coding[0].code: "resolved"`).

---

### 4. Encounters (Visits & Appointments) (`/Encounter`)

#### A. Query Encounters
- **Endpoint:** `GET /Encounter` (query by `?patient=12742400` or `?status=in-progress`)

#### B. Get Encounter by ID
- **Endpoint:** `GET /Encounter/:id`

#### C. Create Encounter
- **Endpoint:** `POST /Encounter`
- **Status:** `201 Created`
- **Payload:**
```json
{
  "resourceType": "Encounter",
  "status": "in-progress",
  "type": [
    {
      "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/v2-0004", "code": "O" }]
    }
  ],
  "subject": { "reference": "Patient/12724066" },
  "reasonCode": [{ "text": "Neck Pain" }],
  "period": {
    "start": "2026-08-26T08:00:00Z",
    "end": "2026-08-26T09:00:00Z"
  }
}
```

#### D. Patch Encounter
- **Endpoint:** `PATCH /Encounter/:id`
- **Payload:**
```json
[
  { "op": "replace", "path": "/period/start", "value": "2026-08-26T08:30:00.000Z" },
  { "op": "replace", "path": "/period/end", "value": "2026-08-26T09:30:00.000Z" }
]
```

---

### 5. Medication Requests (Prescriptions & Orders) (`/MedicationRequest`)

#### A. Query Prescriptions
- **Endpoint:** `GET /MedicationRequest?patient=12742400`

#### B. Create Prescription / Medication Order
- **Endpoint:** `POST /MedicationRequest`
- **Status:** `201 Created`
- **Payload:**
```json
{
  "resourceType": "MedicationRequest",
  "status": "active",
  "intent": "order",
  "medicationCodeableConcept": {
    "coding": [
      {
        "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
        "code": "352362"
      }
    ],
    "text": "Acetaminophen"
  },
  "subject": { "reference": "Patient/12742400" },
  "dosageInstruction": [
    {
      "text": "5 mL, Oral, Daily.",
      "additionalInstruction": [{ "text": "Take with food." }],
      "timing": {
        "repeat": {
          "boundsPeriod": {
            "start": "2026-08-26T10:00:00Z",
            "end": "2026-09-02T10:00:00Z"
          },
          "duration": 1.0,
          "durationUnit": "d"
        }
      }
    }
  ],
  "dispenseRequest": {
    "quantity": { "value": 10.0, "unit": "tbl" }
  }
}
```

#### C. Patch Prescription Status (`stopped` / `cancelled`)
- **Endpoint:** `PATCH /MedicationRequest/:id`
- **Cerner Status Rules:**
  - If `boundsPeriod.start` is in the past: resolves to `stopped`.
  - If `boundsPeriod.start` is in the future: resolves to `cancelled`.
- **Payload:**
```json
[
  { "op": "replace", "path": "/status", "value": "stopped" }
]
```

---

### 6. Practitioners (Doctors & Clinicians) (`/Practitioner`)

#### A. Search Doctors
- **Endpoint:** `GET /Practitioner?name=Smith` or `GET /Practitioner?_id=11638321`

#### B. Get Doctor by ID
- **Endpoint:** `GET /Practitioner/:id`

#### C. Create Doctor Profile
- **Endpoint:** `POST /Practitioner`
- **Status:** `201 Created`
- **Payload:**
```json
{
  "resourceType": "Practitioner",
  "active": true,
  "name": [
    {
      "family": "Williams",
      "given": ["Rory", "James"],
      "prefix": ["Dr."],
      "suffix": ["M.D."]
    }
  ],
  "identifier": [
    {
      "type": { "coding": [{ "code": "DEA", "system": "http://terminology.hl7.org/CodeSystem/v2-0203" }] },
      "system": "urn:oid:2.16.840.1.113883.4.814",
      "value": "CW1234563"
    }
  ]
}
```

---

### 7. Patient Full Chart Dashboard Aggregator (`/api/fhir/patient-summary/:id`)

- **Endpoint:** `GET /api/fhir/patient-summary/12742400`
- **Description:** One-shot aggregation endpoint returning patient demographics, active vitals, lab reports, conditions/diagnoses, past encounters, and current medication orders.
- **Example Response:**
```json
{
  "success": true,
  "patientId": "12742400",
  "timestamp": "2026-08-26T08:50:00.000Z",
  "data": {
    "patient": { "id": "12742400", "name": [...] },
    "observations": { "vitalSigns": [...], "laboratories": [...] },
    "conditions": { "active": [...], "resolved": [...] },
    "encounters": [...],
    "medications": [...]
  }
}
```

---

## 💻 Frontend TypeScript Integration Snippets

### Axios FHIR Client Example:
```typescript
import axios from 'axios';

const fhirClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_FHIR_API_URL || 'http://localhost:8080/api/v1/fhir',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/fhir+json, application/json',
  },
});

// Attach JWT token automatically
fhirClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getPatientChart = async (patientId: string) => {
  const res = await fhirClient.get(`/patient-summary/${patientId}`);
  return res.data;
};

export const createCondition = async (conditionPayload: any) => {
  const res = await fhirClient.post('/Condition', conditionPayload);
  return res.data;
};

export const patchPrescription = async (medId: string, status: 'stopped' | 'cancelled') => {
  const res = await fhirClient.patch(`/MedicationRequest/${medId}`, [
    { op: 'replace', path: '/status', value: status },
  ]);
  return res.data;
};
```

---

## 🔍 How to Test in Swagger UI

1. Open your browser and navigate to:
   👉 **`http://localhost:3006/api-docs`**
2. Expand the **Cerner FHIR** tag.
3. Click on any endpoint (e.g. `GET /api/fhir/Condition`, `POST /api/fhir/MedicationRequest`).
4. Click **Try it out**, fill in the parameters or JSON body, and click **Execute**.
5. Inspect the live HTTP status, response headers, and JSON response body.
