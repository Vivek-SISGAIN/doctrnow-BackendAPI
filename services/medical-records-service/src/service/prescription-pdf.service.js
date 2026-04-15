/**
 * PrescriptionPdfService.js
 * PDFKit-based PDF generation that mirrors the React PrescriptionPdfTemplate UI.
 *
 * Colour palette (matched to Tailwind tokens used in the React template):
 *   sky-800   #075985   – headings, "R" glyph, signature line
 *   sky-700   #0369a1   – horizontal rules, borders
 *   sky-600   #0284c7   – bullet dot in notes header
 *   sky-100   #e0f2fe   – medication circle background
 *   slate-900 #0f172a   – primary text
 *   slate-700 #334155   – body text
 *   slate-600 #475569   – secondary text
 *   slate-500 #64748b   – label / caption text
 *   slate-200 #e2e8f0   – default card border
 *   slate-50  #f8fafc   – default card background
 *   rose-700  #be123c   – blood group, allergy text
 *   rose-200  #fecdd3   – allergy badge border
 *   rose-50   #fff1f2   – allergy badge background
 *   amber-700 #b45309   – precaution heading
 *   amber-200 #fde68a   – precaution border
 *   amber-50  #fffbeb   – precaution background
 *   emerald-700 #15803d – diet heading
 *   emerald-200 #bbf7d0 – diet border
 *   emerald-50  #f0fdf4 – diet background
 *   sky-50    #f0f9ff   – vitals / notes card background
 *   sky-200   #bae6fd   – vitals / notes card border
 */

const PDFDocument = require('pdfkit');
const https = require('https');

// ─── Constants ────────────────────────────────────────────────────────────────
const PAGE_W = 595.28;           // A4 width  (pt)
const PAGE_H = 841.89;           // A4 height (pt)
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;   // 511.28 pt

// Colours
const C = {
  sky800: '#075985',
  sky700: '#0369a1',
  sky600: '#0284c7',
  sky100: '#e0f2fe',
  sky50: '#f0f9ff',
  sky200: '#bae6fd',
  slate900: '#0f172a',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate200: '#e2e8f0',
  slate50: '#f8fafc',
  rose700: '#be123c',
  rose200: '#fecdd3',
  rose50: '#fff1f2',
  amber700: '#b45309',
  amber200: '#fde68a',
  amber50: '#fffbeb',
  emerald700: '#15803d',
  emerald200: '#bbf7d0',
  emerald50: '#f0fdf4',
  watermark: '#2AACE2',
};

// ─── Watermark image cache ─────────────────────────────────────────────────────
let _watermarkBuffer = null;

async function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Fetch Timeout (5s)'));
    });
  });
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
function rv(v) {
  return v && String(v).trim() ? String(v).trim() : '-';
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function calcAge(dob, explicit) {
  if (typeof explicit === 'number' && explicit > 0) return `${explicit} yrs`;
  if (!dob) return '-';
  const birth = new Date(dob);
  if (isNaN(birth)) return '-';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} yrs`;
}

function formatGender(v) {
  if (!v) return '-';
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function formatBloodGroup(v) {
  if (!v) return '-';
  return v.replace('_POS', '+').replace('_NEG', '-').replace('_', '');
}

// ─── Low-level drawing helpers ────────────────────────────────────────────────

/**
 * Draw the diagonal watermark centred on the current page.
 */
function drawWatermark(doc, imgBuf) {
  const cx = PAGE_W / 2;
  const cy = PAGE_H / 2;

  doc.save();
  doc.opacity(0.10);
  doc.rotate(-45, { origin: [cx, cy] });
  doc.fillColor(C.watermark);

  if (imgBuf) {
    try {
      doc.image(imgBuf, cx - 110, cy - 290, { width: 220 });
    } catch (_) { }
  }

  doc.font('Helvetica-Bold').fontSize(96).text('DoctrNow', cx - 290, cy - 60, { width: 580, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(30).text('Your Healthcare Partner', cx - 290, cy + 52, { width: 580, align: 'center' });

  doc.restore();
}

/**
 * Draw a filled+stroked rounded rectangle.
 * Resets fillColor to slate900 after so subsequent text calls use a sensible default.
 */
function card(doc, x, y, w, h, fillHex, strokeHex, radius = 6) {
  doc.roundedRect(x, y, w, h, radius).fillAndStroke(fillHex, strokeHex);
  doc.fillColor(C.slate900); // reset
}

/**
 * Draw a two-line label + value block.
 */
function labelValue(doc, x, y, w, label, value, valueFill) {
  doc.font('Helvetica').fontSize(8).fillColor(C.slate500).text(label, x, y, { width: w, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(valueFill || C.slate900).text(rv(value), x, y + 11, { width: w });
}

/**
 * Draw a small pill / badge.
 * Returns the right-edge x so the caller can advance the cursor.
 */
function pill(doc, x, y, text, fillHex, strokeHex, textFill) {
  const PAD_H = 6, PAD_V = 3;
  const textW = doc.widthOfString(text, { fontSize: 9 });
  const pillW = textW + PAD_H * 2;
  const pillH = 16;
  doc.roundedRect(x, y, pillW, pillH, pillH / 2).fillAndStroke(fillHex, strokeHex);
  doc.font('Helvetica').fontSize(9).fillColor(textFill).text(text, x + PAD_H, y + PAD_V, { lineBreak: false });
  doc.fillColor(C.slate900);
  return x + pillW + 5;
}

/**
 * Draw a bullet list inside a bounding box.
 * Returns the Y position after the last item.
 */
function bulletList(doc, items, x, y, w, bulletFill) {
  if (!items || items.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(C.slate600).text('None recorded.', x, y, { width: w });
    return doc.y + 4;
  }
  let curY = y;
  items.forEach(item => {
    doc.circle(x + 4, curY + 5, 2).fill(bulletFill);
    doc.fillColor(C.slate700).font('Helvetica').fontSize(10).text(item, x + 12, curY, { width: w - 14 });
    curY = doc.y + 5;
  });
  doc.fillColor(C.slate900);
  return curY;
}

/**
 * Add a new page and re-draw the watermark.
 */
function newPage(doc, imgBuf) {
  doc.addPage();
  drawWatermark(doc, imgBuf);
}

/**
 * Ensure there is at least `need` pt of vertical space remaining.
 * If not, start a new page.
 */
function ensureSpace(doc, need, imgBuf) {
  if (doc.y + need > PAGE_H - MARGIN) {
    newPage(doc, imgBuf);
    doc.y = MARGIN + 10;
  }
}

// ─── Main Service ─────────────────────────────────────────────────────────────
class PrescriptionPdfService {
  async generate(documentModel) {
    // Ensure watermark is pre-fetched (lazy-load if not yet cached)
    if (!_watermarkBuffer) {
      await this.preFetchWatermark();
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: `Rx ${documentModel.prescription?.rxId || ''}`, Author: 'DoctrNow' } });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      this._render(doc, documentModel);
      doc.end();
    });
  }

  /**
   * Pre-fetches the watermark image from the remote URL and caches it in memory.
   * Called automatically on service load to reduce request latency.
   */
  async preFetchWatermark() {
    if (_watermarkBuffer) return;
    const URL = 'https://media.istockphoto.com/id/1219088285/vector/health-clinic-medic-icon-vector.jpg?s=612x612&w=0&k=20&c=yJU6lYzm4o44edh-qXxnLVJgG5wkAbd75P9AndQVz34=';
    try {
      console.log('[PrescriptionPdfService] Pre-fetching watermark image...');
      _watermarkBuffer = await fetchImageBuffer(URL);
      console.log('[PrescriptionPdfService] Watermark image cached successfully.');
    } catch (e) {
      console.warn('[PrescriptionPdfService] Watermark image pre-fetch failed:', e.message);
    }
  }

  _render(doc, model) {
    const { facility, prescription, patient, doctor, vitals, notes } = model;
    const imgBuf = _watermarkBuffer;

    // ── Page 1 watermark ──────────────────────────────────────────────────────
    drawWatermark(doc, imgBuf);

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1 · Facility Header
    // ─────────────────────────────────────────────────────────────────────────
    let y = MARGIN + 4;

    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.sky800)
      .text(facility.name, MARGIN, y, { align: 'center', width: CONTENT_W });
    y = doc.y + 4;

    doc.font('Helvetica').fontSize(10).fillColor(C.slate600)
      .text(facility.address, MARGIN, y, { align: 'center', width: CONTENT_W });
    y = doc.y + 2;

    doc.text(`Tel: ${facility.phone} | Email: ${facility.email}`, MARGIN, y, { align: 'center', width: CONTENT_W });
    y = doc.y + 2;

    doc.font('Helvetica').fontSize(8).fillColor(C.slate500)
      .text(`License No: ${facility.license}`, MARGIN, y, { align: 'center', width: CONTENT_W });
    y = doc.y + 10;

    // border-b-2 border-sky-700
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor(C.sky700).lineWidth(2).stroke();
    y += 16;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2 · Rx ID + Date row  (border-b border-slate-200)
    // ─────────────────────────────────────────────────────────────────────────
    // Big "R"
    doc.font('Helvetica-Bold').fontSize(24).fillColor(C.sky800).text('R', MARGIN, y);
    doc.font('Helvetica').fontSize(10).fillColor(C.slate500).text(prescription.rxId, MARGIN + 20, y + 5, { lineBreak: false });

    const dateStr = `Date & Time: ${formatDate(prescription.consultationDate)} | ${formatTime(prescription.consultationTime)}`;
    doc.font('Helvetica').fontSize(10).fillColor(C.slate700)
      .text(dateStr, MARGIN, y + 5, { width: CONTENT_W, align: 'right' });

    y = doc.y + 8;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).strokeColor(C.slate200).lineWidth(0.5).stroke();
    y += 14;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3 · Vitals  (if present)
    // ─────────────────────────────────────────────────────────────────────────
    const vitalsList = vitals
      ? [
        ['Blood Pressure', vitals.bp, 'mmHg'],
        ['Pulse', vitals.pulse, 'bpm'],
        ['Temperature', vitals.temp, 'F'],
        ['SpO2', vitals.spo2, '%'],
        ['Weight', vitals.weight, 'kg'],
        ['Height', vitals.height, 'cm'],
      ].filter(([, v]) => v)
      : [];

    if (vitalsList.length > 0 || (vitals && vitals.preCallNotes)) {
      const VCOLS = Math.min(vitalsList.length, 6);
      const BOX_W = 76;
      const BOX_H = 54;
      const preH = vitals.preCallNotes
        ? 14 + doc.heightOfString(vitals.preCallNotes, { width: CONTENT_W - 24 }) + 10
        : 0;
      const cardH = 34 + (vitalsList.length > 0 ? BOX_H + 10 : 0) + preH;

      ensureSpace(doc, cardH + 14, imgBuf);

      card(doc, MARGIN, y, CONTENT_W, cardH, C.sky50, C.sky200);

      // Section label
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.slate500)
        .text('VITALS AT CONSULTATION', MARGIN + 12, y + 10, { characterSpacing: 1 });

      if (vitalsList.length > 0) {
        const rowY = y + 26;
        const step = VCOLS > 0 ? (CONTENT_W - 24) / VCOLS : BOX_W + 4;
        vitalsList.forEach(([label, value, unit], i) => {
          const bx = MARGIN + 12 + i * step;
          doc.roundedRect(bx, rowY, step - 4, BOX_H, 4).fillAndStroke('#ffffff', C.sky200);
          doc.font('Helvetica').fontSize(7.5).fillColor(C.slate500)
            .text(label.toUpperCase(), bx + 2, rowY + 7, { width: step - 8, align: 'center' });
          doc.font('Helvetica-Bold').fontSize(11).fillColor(C.slate900)
            .text(String(value), bx + 2, rowY + 19, { width: step - 8, align: 'center' });
          doc.font('Helvetica').fontSize(8).fillColor(C.slate500)
            .text(unit, bx + 2, rowY + 34, { width: step - 8, align: 'center' });
          doc.fillColor(C.slate900);
        });
      }

      if (vitals.preCallNotes) {
        const noteTop = y + (vitalsList.length > 0 ? 26 + BOX_H + 10 : 24);
        doc.moveTo(MARGIN + 12, noteTop).lineTo(MARGIN + CONTENT_W - 12, noteTop)
          .strokeColor(C.sky200).lineWidth(0.5).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.slate500)
          .text('PRE-CONSULTATION NOTES', MARGIN + 12, noteTop + 6, { characterSpacing: 1 });
        doc.font('Helvetica').fontSize(10).fillColor(C.slate700)
          .text(vitals.preCallNotes, MARGIN + 12, noteTop + 18, { width: CONTENT_W - 24 });
      }

      y += cardH + 12;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4 · Patient Details
    // ─────────────────────────────────────────────────────────────────────────
    const allergies = (patient.allergies || []).filter(Boolean);
    const allergyExtra = allergies.length > 0
      ? 14 + 22 + 10   // label row + pill row + bottom pad
      : 0;
    const patientCardH = 90 + allergyExtra;

    ensureSpace(doc, patientCardH + 14, imgBuf);

    card(doc, MARGIN, y, CONTENT_W, patientCardH, C.slate50, C.slate200);

    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.slate500)
      .text('PATIENT DETAILS', MARGIN + 12, y + 10, { characterSpacing: 1 });

    // Row 1: Name | MRN | Diagnosis
    const COL1 = MARGIN + 12, W1 = 150;
    const COL2 = MARGIN + 12 + 170, W2 = 120;
    const COL3 = MARGIN + 12 + 310, W3 = 177;

    labelValue(doc, COL1, y + 26, W1, 'Patient Name', patient.patient);
    labelValue(doc, COL2, y + 26, W2, 'MRN', patient.mrn);
    labelValue(doc, COL3, y + 26, W3, 'Diagnosis', prescription.diagnosis);

    // Row 2: Age/Gender | Emirates ID | Blood Group
    labelValue(doc, COL1, y + 60, W1, 'Age / Gender', `${calcAge(patient.dateOfBirth, patient.age)} / ${formatGender(patient.gender)}`);
    labelValue(doc, COL2, y + 60, W2, 'Emirates ID', patient.emiratesId);
    labelValue(doc, COL3, y + 60, W3, 'Blood Group', formatBloodGroup(patient.bloodGroup), C.rose700);

    // Allergies
    if (allergies.length > 0) {
      const allergyTop = y + 88;
      doc.moveTo(MARGIN + 12, allergyTop).lineTo(MARGIN + CONTENT_W - 12, allergyTop)
        .strokeColor(C.slate200).lineWidth(0.5).stroke();

      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.rose700)
        .text('⚠  KNOWN ALLERGIES', MARGIN + 12, allergyTop + 6, { characterSpacing: 0.5 });

      let px = MARGIN + 12;
      allergies.forEach(allergy => {
        px = pill(doc, px, allergyTop + 18, allergy, C.rose50, C.rose200, C.rose700);
      });
      doc.fillColor(C.slate900);
    }

    y += patientCardH + 12;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5 · Doctor's Notes
    // ─────────────────────────────────────────────────────────────────────────
    if (notes && notes.trim()) {
      const notesBodyH = doc.heightOfString(notes.trim(), { width: CONTENT_W - 24 });
      const notesCardH = 28 + notesBodyH + 12;

      ensureSpace(doc, notesCardH + 14, imgBuf);

      card(doc, MARGIN, y, CONTENT_W, notesCardH, C.sky50, C.sky200);

      // small sky-600 dot  +  label
      doc.circle(MARGIN + 14, y + 14, 4).fill(C.sky600);
      doc.fillColor(C.slate500);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.slate500)
        .text("DOCTOR'S NOTES", MARGIN + 22, y + 10, { characterSpacing: 1 });

      doc.font('Helvetica').fontSize(10).fillColor(C.slate700)
        .text(notes.trim(), MARGIN + 12, y + 24, { width: CONTENT_W - 24 });

      y += notesCardH + 12;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6 · Medications
    // ─────────────────────────────────────────────────────────────────────────
    ensureSpace(doc, 30, imgBuf);

    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.slate900).text('Medications', MARGIN, y);
    y = doc.y + 8;

    const medications = prescription.medications || [];
    const MED_W = (CONTENT_W - 10) / 2;   // two-column grid
    const MED_H = 58;

    for (let i = 0; i < medications.length; i += 2) {
      ensureSpace(doc, MED_H + 10, imgBuf);
      const rowY = doc.y;

      _drawMedCard(doc, medications[i], MARGIN, rowY, MED_W, MED_H, i + 1);
      if (medications[i + 1]) {
        _drawMedCard(doc, medications[i + 1], MARGIN + MED_W + 10, rowY, MED_W, MED_H, i + 2);
      }
      doc.y = rowY + MED_H + 8;
    }

    y = doc.y + 4;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7 · Precautions + Diet  (side-by-side)
    // ─────────────────────────────────────────────────────────────────────────
    const HALF_W = (CONTENT_W - 10) / 2;

    const precItems = prescription.precautions || [];
    const dietItems = prescription.dietRecommendations || [];

    // Estimate heights for both cards, use the taller value so they match
    const precBodyH = precItems.length === 0
      ? 18
      : precItems.reduce((acc, t) => acc + doc.heightOfString(t, { width: HALF_W - 24 }) + 8, 0);
    const dietBodyH = dietItems.length === 0
      ? 18
      : dietItems.reduce((acc, t) => acc + doc.heightOfString(t, { width: HALF_W - 24 }) + 8, 0);

    const sideBySideH = Math.max(precBodyH, dietBodyH) + 40;

    ensureSpace(doc, sideBySideH + 14, imgBuf);
    const sectionTop = doc.y;

    // Precautions card
    card(doc, MARGIN, sectionTop, HALF_W, sideBySideH, C.amber50, C.amber200);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.amber700)
      .text('Precautions', MARGIN + 12, sectionTop + 10);
    bulletList(doc, precItems, MARGIN + 12, sectionTop + 28, HALF_W - 24, C.amber700);

    // Diet card
    const dietX = MARGIN + HALF_W + 10;
    card(doc, dietX, sectionTop, HALF_W, sideBySideH, C.emerald50, C.emerald200);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.emerald700)
      .text('Diet Recommendations', dietX + 12, sectionTop + 10);
    bulletList(doc, dietItems, dietX + 12, sectionTop + 28, HALF_W - 24, C.emerald700);

    doc.y = sectionTop + sideBySideH + 16;

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 8 · Doctor signature footer
    // ─────────────────────────────────────────────────────────────────────────
    ensureSpace(doc, 80, imgBuf);

    // border-t-2 border-sky-700
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y).strokeColor(C.sky700).lineWidth(2).stroke();
    const footY = doc.y + 12;

    // Left: doctor info
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.slate900).text(doctor.name, MARGIN, footY);
    doc.font('Helvetica').fontSize(10).fillColor(C.slate600).text(rv(doctor.specialty), MARGIN, footY + 17);
    let extraY = footY + 31;
    if (doctor.medicalDegree) {
      doc.font('Helvetica').fontSize(8).fillColor(C.slate500).text(doctor.medicalDegree, MARGIN, extraY);
      extraY += 12;
    }
    if (doctor.license) {
      doc.font('Helvetica').fontSize(8).fillColor(C.slate500).text(`License: ${doctor.license}`, MARGIN, extraY);
      extraY += 12;
    }
    if (doctor.hospital) {
      doc.font('Helvetica').fontSize(8).fillColor(C.slate500).text(doctor.hospital, MARGIN, extraY);
    }

    // Right: italic signature + underline + e-signed
    const sigText = doctor.signature || doctor.name;
    doc.font('Helvetica-Oblique').fontSize(22).fillColor(C.sky800)
      .text(sigText, MARGIN, footY, { width: CONTENT_W, align: 'right' });

    const sigLineY = footY + 28;
    doc.moveTo(MARGIN + CONTENT_W - 180, sigLineY)
      .lineTo(MARGIN + CONTENT_W, sigLineY)
      .strokeColor(C.sky700).lineWidth(1.5).stroke();

    doc.font('Helvetica').fontSize(8).fillColor(C.slate500)
      .text(
        `E-Signed: ${formatDateTime(prescription.signedAt || prescription.sentAt)}`,
        MARGIN,
        sigLineY + 6,
        { width: CONTENT_W, align: 'right' }
      );
  }
}

// ─── Medication card helper (module-level so it can be used without `this`) ──
function _drawMedCard(doc, med, x, y, w, h, idx) {
  const isControlled = med.isControlled || med.controlled;
  const bgFill = isControlled ? C.amber50 : C.slate50;
  const bgStroke = isControlled ? C.amber200 : C.slate200;

  card(doc, x, y, w, h, bgFill, bgStroke);

  // Numbered circle (sky-100 background, sky-800 text)
  doc.circle(x + 22, y + h / 2, 14).fillAndStroke(C.sky100, C.sky200);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.sky800)
    .text(String(idx), x + 22 - 5, y + h / 2 - 6, { width: 10, align: 'center' });

  // Med name + strength
  const nameX = x + 44;
  const nameW = w - 54;

  let nameStr = `${med.name}${med.strength ? ' ' + med.strength : ''}`.trim();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.slate900)
    .text(nameStr, nameX, y + 10, { width: nameW, lineBreak: false });

  // Controlled badge (amber pill)
  if (isControlled) {
    const badgeX = nameX + doc.widthOfString(nameStr, { fontSize: 10 }) + 6;
    pill(doc, badgeX, y + 9, '🔒 Controlled', C.amber50, C.amber200, C.amber700);
  }

  // Dosage / frequency / duration
  const detail = `${rv(med.dosage)} tablet(s) • ${rv(med.frequency)} • ${rv(med.duration)}`;
  doc.font('Helvetica').fontSize(9).fillColor(C.slate600)
    .text(detail, nameX, y + 26, { width: nameW });

  doc.fillColor(C.slate900);
}

const service = new PrescriptionPdfService();
// Start pre-fetching immediately on module load to warm up cache
service.preFetchWatermark();

module.exports = service;