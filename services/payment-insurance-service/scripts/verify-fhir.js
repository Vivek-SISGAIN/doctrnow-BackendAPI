const PORT = process.env.PORT || 3006;
const base = `http://localhost:${PORT}`;

const testPatientPayload = {
  resourceType: 'Patient',
  extension: [
    {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
      valueCode: 'M',
    },
  ],
  name: [
    {
      use: 'official',
      family: 'Wolf',
      given: ['Person', 'Name'],
    },
  ],
  gender: 'male',
  birthDate: '1990-09-15',
  address: [
    {
      use: 'home',
      line: ['121212 Metcalf Drive', 'Apartment 403'],
      city: 'Kansas City',
      state: 'KS',
      postalCode: '64199',
      country: 'United States of America',
    },
  ],
};

const patchPayload = [
  {
    path: '/identifier/-',
    op: 'add',
    value: {
      type: {
        coding: [
          {
            code: 'MR',
            system: 'http://hl7.org/fhir/v2/0203',
          },
        ],
      },
      system: 'urn:oid:1.1.1.1.1.1',
      value: 'TEST-IDENTIFIER-99999',
      period: {
        start: '2016-01-02T00:00:00-05:00',
        end: '2020-01-02T00:00:00-05:00',
      },
    },
  },
];

const createConditionPayload = {
  resourceType: 'Condition',
  abatementDateTime: '2015-10-14T13:13:20-06:00',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-category',
          code: 'problem-list-item',
          display: 'Problem List Item TEST',
        },
      ],
    },
  ],
  clinicalStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
        code: 'resolved',
        display: 'Resolved',
      },
    ],
    text: 'Resolved',
  },
  code: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: 'confirmed',
        display: 'confirmed_display',
      },
    ],
    text: 'confirmed_text',
  },
  encounter: {
    reference: 'Encounter/98107594',
  },
  note: [
    {
      text: 'ConditionNote',
    },
  ],
  onsetDateTime: '2015-10-14T13:13:20-06:00',
  severity: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '255604002',
        display: 'Mild',
      },
    ],
  },
  subject: {
    reference: 'Patient/13034092',
  },
  verificationStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
        code: 'confirmed',
        display: 'Confirmed',
      },
    ],
    text: 'Confirmed',
  },
};

const updateConditionPayload = {
  resourceType: 'Condition',
  id: 'd2593255383',
  subject: {
    reference: 'Patient/13502100',
  },
  abatementDateTime: '',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-category',
          code: 'encounter-diagnosis',
          display: 'encounter-diagnosis',
        },
      ],
      text: 'encounter-diagnosis',
    },
  ],
  code: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '1137438000',
        display: 'Pain due to arthritis',
        userSelected: true,
      },
    ],
    text: 'Pain due to arthritis',
  },
  clinicalStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
        code: 'active',
        display: 'Active',
        userSelected: false,
      },
    ],
    text: 'Active',
  },
  severity: {
    coding: [
      {
        system: 'http://snomed.info/sct',
        code: '255604002',
        display: 'Mild',
      },
    ],
  },
  onsetDateTime: '2015-10-14T13:13:20-06:00',
  verificationStatus: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
        code: 'confirmed',
        display: 'Confirmed',
      },
    ],
    text: 'Confirmed',
  },
};

async function run() {
  console.log('--- RUNNING CERNER FHIR VERIFICATION TESTS ---');

  const tests = [
    { name: 'Health check', url: '/health', method: 'GET', expectedStatus: 200 },
    { name: 'Sandbox test patients', url: '/api/fhir/sandbox-patients', method: 'GET', expectedStatus: 200 },
    { name: 'Direct Patient by ID (12742400)', url: '/Patient/12742400', method: 'GET', expectedStatus: 200 },
    { name: 'Patient Search by Name (Peters)', url: '/Patient?name=Peters', method: 'GET', expectedStatus: 200 },
    { name: 'Patient Search with count (_count=10)', url: '/Patient?_count=10', method: 'GET', expectedStatus: 200 },
    { name: 'Observations (vital signs)', url: '/Observation?patient=12742400&category=vital-signs', method: 'GET', expectedStatus: 200 },
    { name: 'Observations (laboratory)', url: '/Observation?patient=12742400&category=laboratory', method: 'GET', expectedStatus: 200 },
    { name: 'Encounters for Patient', url: '/Encounter?patient=12742400', method: 'GET', expectedStatus: 200 },
    { name: 'MedicationRequests for Patient', url: '/MedicationRequest?patient=12742400', method: 'GET', expectedStatus: 200 },
    { name: 'Practitioner Search (Doctor: Smith)', url: '/Practitioner?name=Smith', method: 'GET', expectedStatus: 200 },
    { name: 'Insurance Coverage Check', url: '/api/insurance/coverage/784-1990-1234567-1', method: 'GET', expectedStatus: 200 },
  ];

  let passed = 0;
  for (const t of tests) {
    try {
      const t0 = Date.now();
      const res = await fetch(base + t.url, { method: t.method || 'GET' });
      const duration = Date.now() - t0;
      if (res.status === t.expectedStatus) {
        console.log(`✅ [PASS] ${t.name} (${t.url}) -> ${res.status} (${duration}ms)`);
        passed++;
      } else {
        const json = await res.json();
        console.error(`❌ [FAIL] ${t.name} (${t.url}) -> Expected ${t.expectedStatus}, got ${res.status}: ${JSON.stringify(json)}`);
      }
    } catch (e) {
      console.error(`❌ [ERROR] ${t.name} (${t.url}) -> ${e.message}`);
    }
  }

  // Test POST /Patient (Create Patient)
  try {
    const postRes = await fetch(base + '/Patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPatientPayload),
    });
    const postData = await postRes.json();
    if (postRes.status === 201 && postData.id) {
      console.log(`✅ [PASS] POST /Patient (Create Patient) -> 201 (Created ID: ${postData.id})`);
      passed++;

      // Test PATCH /Patient/:id
      const patchRes = await fetch(base + `/Patient/${postData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
      });
      const patchData = await patchRes.json();
      if (patchRes.status === 200 && patchData.data.identifier?.length > 0) {
        console.log(`✅ [PASS] PATCH /Patient/${postData.id} (Add Identifier) -> 200 (Version: ${patchData.versionId})`);
        passed++;
      } else {
        console.error(`❌ [FAIL] PATCH /Patient/${postData.id} -> ${patchRes.status}`);
      }
    } else {
      console.error(`❌ [FAIL] POST /Patient -> ${postRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] POST/PATCH Patient -> ${e.message}`);
  }

  // Test POST /Condition (Create Condition)
  try {
    const postCondRes = await fetch(base + '/Condition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createConditionPayload),
    });
    const postCondData = await postCondRes.json();
    if (postCondRes.status === 201 && postCondData.id) {
      console.log(`✅ [PASS] POST /Condition (Create Condition) -> 201 (Created ID: ${postCondData.id})`);
      passed++;
    } else {
      console.error(`❌ [FAIL] POST /Condition -> ${postCondRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] POST /Condition -> ${e.message}`);
  }

  // Test PUT /Condition/:id (Update Condition)
  try {
    const putCondRes = await fetch(base + '/Condition/d2593255383', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateConditionPayload),
    });
    const putCondData = await putCondRes.json();
    if (putCondRes.status === 200 && putCondData.id === 'd2593255383') {
      console.log(`✅ [PASS] PUT /Condition/d2593255383 (Update Condition) -> 200 (Version: ${putCondData.versionId})`);
      passed++;
    } else {
      console.error(`❌ [FAIL] PUT /Condition/d2593255383 -> ${putCondRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] PUT /Condition -> ${e.message}`);
  }

  // Test POST /MedicationRequest (Create MedicationRequest)
  try {
    const postMedRes = await fetch(base + '/MedicationRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        doNotPerform: false,
        reportedBoolean: true,
        medicationCodeableConcept: {
          coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '352362' }],
          text: 'Acetaminophen',
        },
        subject: { reference: 'Patient/12742400' },
        encounter: { reference: 'Encounter/97953530' },
        dosageInstruction: [
          {
            text: '5 mL, Oral, Daily.',
            timing: {
              repeat: {
                boundsPeriod: {
                  start: '2020-02-25T23:19:10Z',
                  end: '2021-02-27T23:19:10Z',
                },
              },
            },
          },
        ],
      }),
    });
    const postMedData = await postMedRes.json();
    if (postMedRes.status === 201 && postMedData.id) {
      console.log(`✅ [PASS] POST /MedicationRequest (Create MedicationRequest) -> 201 (Created ID: ${postMedData.id})`);
      passed++;

      // Test PATCH /MedicationRequest/:id
      const patchMedRes = await fetch(base + `/MedicationRequest/${postMedData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ op: 'replace', path: '/status', value: 'stopped' }]),
      });
      const patchMedData = await patchMedRes.json();
      if (patchMedRes.status === 200 && patchMedData.status === 'stopped') {
        console.log(`✅ [PASS] PATCH /MedicationRequest/${postMedData.id} (Status: stopped) -> 200 (Version: ${patchMedData.versionId})`);
        passed++;
      } else {
        console.error(`❌ [FAIL] PATCH /MedicationRequest/${postMedData.id} -> ${patchMedRes.status}`);
      }
    } else {
      console.error(`❌ [FAIL] POST /MedicationRequest -> ${postMedRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] POST/PATCH MedicationRequest -> ${e.message}`);
  }

  // Test POST /Observation (Create Observation)
  try {
    const postObsRes = await fetch(base + '/Observation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '8331-1' }], text: 'Temperature Oral' },
        subject: { reference: 'Patient/12457981' },
        valueQuantity: { value: 37.2, unit: 'degC', system: 'http://unitsofmeasure.org', code: 'Cel' },
      }),
    });
    const postObsData = await postObsRes.json();
    if (postObsRes.status === 201 && postObsData.id) {
      console.log(`✅ [PASS] POST /Observation (Create Observation) -> 201 (Created ID: ${postObsData.id})`);
      passed++;
    } else {
      console.error(`❌ [FAIL] POST /Observation -> ${postObsRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] POST /Observation -> ${e.message}`);
  }

  // Test PUT /Observation/:id (Update Observation)
  try {
    const putObsRes = await fetch(base + '/Observation/VS-197356031', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'Observation',
        id: 'VS-197356031',
        status: 'corrected',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: 'https://fhir.cerner.com/d242a518-4074-4bd4-a3a6-adfe0c5c1c51/codeSet/72', code: '703558' }], text: 'Temperature Oral' },
        subject: { reference: 'Patient/12457979' },
        valueQuantity: { value: 123, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
      }),
    });
    const putObsData = await putObsRes.json();
    if (putObsRes.status === 200 && putObsData.id === 'VS-197356031') {
      console.log(`✅ [PASS] PUT /Observation/VS-197356031 (Update Observation) -> 200 (Version: ${putObsData.versionId})`);
      passed++;
    } else {
      console.error(`❌ [FAIL] PUT /Observation/VS-197356031 -> ${putObsRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] PUT /Observation -> ${e.message}`);
  }

  // Test POST /Encounter (Create Encounter)
  try {
    const postEncRes = await fetch(base + '/Encounter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'Encounter',
        status: 'in-progress',
        type: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0004', code: 'O' }] }],
        subject: { reference: 'Patient/12724066' },
        reasonCode: [{ text: 'Neck Pain' }],
        period: { start: '2020-03-02T01:13:00Z', end: '2020-03-05T00:00:00Z' },
      }),
    });
    const postEncData = await postEncRes.json();
    if (postEncRes.status === 201 && postEncData.id) {
      console.log(`✅ [PASS] POST /Encounter (Create Encounter) -> 201 (Created ID: ${postEncData.id})`);
      passed++;

      // Test PATCH /Encounter/:id
      const patchEncRes = await fetch(base + `/Encounter/${postEncData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { op: 'replace', path: '/period/start', value: '2015-09-01T00:00:00.000Z' },
          { op: 'replace', path: '/period/end', value: '2017-09-01T00:00:00.000Z' },
        ]),
      });
      const patchEncData = await patchEncRes.json();
      if (patchEncRes.status === 200 && patchEncData.data.period?.start === '2015-09-01T00:00:00.000Z') {
        console.log(`✅ [PASS] PATCH /Encounter/${postEncData.id} (Update period) -> 200 (Version: ${patchEncData.versionId})`);
        passed++;
      } else {
        console.error(`❌ [FAIL] PATCH /Encounter/${postEncData.id} -> ${patchEncRes.status}`);
      }
    } else {
      console.error(`❌ [FAIL] POST /Encounter -> ${postEncRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] POST/PATCH Encounter -> ${e.message}`);
  }

  // Test POST /Practitioner (Create Practitioner)
  try {
    const postPracRes = await fetch(base + '/Practitioner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'Practitioner',
        active: true,
        name: [
          {
            family: 'Williams',
            given: ['Rory', 'James'],
            prefix: ['Dr.'],
            suffix: ['M.D.'],
          },
        ],
        identifier: [
          {
            type: { coding: [{ code: 'DEA', system: 'http://terminology.hl7.org/CodeSystem/v2-0203' }] },
            system: 'urn:oid:2.16.840.1.113883.4.814',
            value: 'CW1234563',
          },
        ],
      }),
    });
    const postPracData = await postPracRes.json();
    if (postPracRes.status === 201 && postPracData.id) {
      console.log(`✅ [PASS] POST /Practitioner (Create Practitioner) -> 201 (Created ID: ${postPracData.id})`);
      passed++;

      // Test GET /Practitioner/:id
      const getPracRes = await fetch(base + `/Practitioner/${postPracData.id}`);
      const getPracData = await getPracRes.json();
      if (getPracRes.status === 200 && getPracData.data.name?.[0]?.family === 'Williams') {
        console.log(`✅ [PASS] GET /Practitioner/${postPracData.id} (Fetch Created Practitioner) -> 200 (Name: Dr. Rory James Williams M.D.)`);
        passed++;
      } else {
        console.error(`❌ [FAIL] GET /Practitioner/${postPracData.id} -> ${getPracRes.status}`);
      }
    } else {
      console.error(`❌ [FAIL] POST /Practitioner -> ${postPracRes.status}`);
    }
  } catch (e) {
    console.error(`❌ [ERROR] POST/GET Practitioner -> ${e.message}`);
  }

  const totalTests = tests.length + 12;
  console.log(`\n=== Test Results: ${passed}/${totalTests} passed ===`);
  process.exit(passed === totalTests ? 0 : 1);
}

run();
