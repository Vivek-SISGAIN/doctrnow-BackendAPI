'use strict';

const axios = require('axios');
const prisma = require('../config/prismaClient');

const BILLABLE_STATUSES = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'];

async function fetchHospitalBillingInfo(hospitalId) {
  try {
    const r = await axios.get(
      `${process.env.SUPER_ADMIN_SERVICE_URL}/internal/hospital/${hospitalId}/commission-rate`,
      { headers: { 'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET } }
    );
    return r.data?.data;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

function addCycleLength(date, cycle) {
  const d = new Date(date);
  if (cycle === 'WEEKLY') { d.setUTCDate(d.getUTCDate() + 7); return d; }
  if (cycle === 'BIWEEKLY') { d.setUTCDate(d.getUTCDate() + 14); return d; }
  if (cycle === 'MONTHLY') { d.setUTCMonth(d.getUTCMonth() + 1); return d; }
  throw new Error(`Unknown commissionInvoiceCycle: ${cycle}`);
}

/**
 * Generates an invoice for one hospital IF its current billing cycle has
 * fully elapsed. Safe to call repeatedly (daily, by cron, or on demand) —
 * it's a no-op unless a cycle just completed. Every transaction it bills
 * gets commissionInvoiceId set inside the same DB transaction as the invoice
 * row, so a transaction can never be billed twice even if this runs twice
 * back-to-back.
 */
async function generateInvoiceForHospitalIfDue(hospitalId) {
  const billing = await fetchHospitalBillingInfo(hospitalId);
  if (!billing) return null; // no commission terms configured — skip, same guard checkout.controller.js already uses

  const lastInvoice = await prisma.commissionInvoice.findFirst({
    where: { hospitalId },
    orderBy: { periodEnd: 'desc' },
  });

  let periodStart;
  if (lastInvoice) {
    periodStart = lastInvoice.periodEnd;
  } else {
    const earliest = await prisma.transaction.findFirst({
      where: { hospitalId, commissionInvoiceId: null, status: { in: BILLABLE_STATUSES } },
      orderBy: { createdAt: 'asc' },
    });
    if (!earliest) return null; // nothing has ever happened for this hospital yet
    periodStart = earliest.createdAt;
  }

  const periodEnd = addCycleLength(periodStart, billing.commissionInvoiceCycle);
  if (periodEnd > new Date()) return null; // this cycle isn't over yet

  const lineItems = await prisma.transaction.findMany({
    where: {
      hospitalId,
      commissionInvoiceId: null,
      status: { in: BILLABLE_STATUSES },
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    include: { refunds: { where: { status: 'PROCESSED' } } },
  });

  let totalCommission = 0;
  for (const txn of lineItems) {
    const refundedCommission = txn.refunds.reduce((sum, r) => sum + Number(r.commissionAmountRefunded || 0), 0);
    totalCommission += Number(txn.commissionAmount) - refundedCommission;
  }
  totalCommission = Math.round(totalCommission * 100) / 100;

  // VAT is not applied here — UAE VAT treatment on platform commission is a
  // policy question that hasn't been confirmed by the client. vatAmount
  // stays 0 (the schema field exists for when that's answered) rather than
  // guessing a rate.
  const vatAmount = 0;
  const totalDue = totalCommission + vatAmount;

  // Even a zero-activity cycle produces an invoice row (auto-marked PAID,
  // nothing owed) — this is what advances periodStart for the next cycle.
  // Without this, a quiet hospital with no bookings in a given week would
  // never get a new invoice row, and the next real transaction would get
  // pulled into an ever-growing stale period.
  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.commissionInvoice.create({
      data: {
        hospitalId,
        periodStart,
        periodEnd,
        totalCommission,
        vatAmount,
        totalDue,
        status: totalDue === 0 ? 'PAID' : 'UNPAID',
        paidAt: totalDue === 0 ? new Date() : null,
      },
    });
    if (lineItems.length > 0) {
      await tx.transaction.updateMany({
        where: { id: { in: lineItems.map((t) => t.id) } },
        data: { commissionInvoiceId: inv.id },
      });
    }
    return inv;
  });

  return invoice;
}

async function generateDueCommissionInvoices() {
  const distinctHospitals = await prisma.transaction.findMany({
    where: { commissionInvoiceId: null, status: { in: BILLABLE_STATUSES } },
    distinct: ['hospitalId'],
    select: { hospitalId: true },
  });

  const generated = [];
  for (const { hospitalId } of distinctHospitals) {
    try {
      const invoice = await generateInvoiceForHospitalIfDue(hospitalId);
      if (invoice) generated.push(invoice);
    } catch (err) {
      console.error(`[invoicing] Failed to generate invoice for hospital ${hospitalId}:`, err?.response?.data || err.message);
    }
  }

  return { hospitalsChecked: distinctHospitals.length, invoicesGenerated: generated.length, invoices: generated };
}

module.exports = { generateDueCommissionInvoices, generateInvoiceForHospitalIfDue };
