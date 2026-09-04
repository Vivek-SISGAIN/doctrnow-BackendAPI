'use strict';

const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin, resolveReadScope } = require('../utils/roleGuards');

/** GET /api/payments/stripe/hospitals/:hospitalId/ledger?startDate&endDate */
async function getHospitalLedger(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { hospitalId } = req.params;
  if (scope.hospitalId && scope.hospitalId !== hospitalId) {
    return res.status(403).json({ success: false, message: "Forbidden: you may only view your own hospital's ledger." });
  }
  const { startDate, endDate } = req.query;

  const where = { hospitalId };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lt = new Date(endDate);
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { refunds: true, disputes: true },
    orderBy: { createdAt: 'desc' },
  });

  const totals = transactions.reduce(
    (acc, t) => {
      acc.grossAmount += Number(t.grossAmount);
      acc.commissionAmount += Number(t.commissionAmount);
      acc.hospitalNetAmount += Number(t.hospitalNetAmount);
      return acc;
    },
    { grossAmount: 0, commissionAmount: 0, hospitalNetAmount: 0 }
  );

  return res.status(200).json({ success: true, data: { transactions, totals } });
}

/** GET /api/payments/stripe/hospitals/:hospitalId/invoices */
async function getHospitalInvoices(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { hospitalId } = req.params;
  if (scope.hospitalId && scope.hospitalId !== hospitalId) {
    return res.status(403).json({ success: false, message: "Forbidden: you may only view your own hospital's invoices." });
  }
  const invoices = await prisma.commissionInvoice.findMany({
    where: { hospitalId },
    orderBy: { periodStart: 'desc' },
  });
  return res.status(200).json({ success: true, data: invoices });
}

/** GET /api/payments/stripe/invoices/:invoiceId */
async function getInvoiceById(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { invoiceId } = req.params;
  const invoice = await prisma.commissionInvoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true },
  });
  if (!invoice || (scope.hospitalId && invoice.hospitalId !== scope.hospitalId)) {
    return res.status(404).json({ success: false, message: `Invoice ${invoiceId} not found.` });
  }
  return res.status(200).json({ success: true, data: invoice });
}

/** PATCH /api/payments/stripe/invoices/:invoiceId/status  Body: { status: "PAID" | "OVERDUE" } */
async function updateInvoiceStatus(req, res) {
  // X-Hospital-ID exists at the gateway (see api-gateway/src/http-proxy/http-proxy.service.ts) but its reliability for HOSPITAL_ADMIN accounts is unverified — do not scope access by it until that's confirmed. See 1.7 audit notes.
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { invoiceId } = req.params;
  const { status } = req.body;
  if (!['PAID', 'OVERDUE'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status must be "PAID" or "OVERDUE".' });
  }

  const invoice = await prisma.commissionInvoice.update({
    where: { id: invoiceId },
    data: { status, paidAt: status === 'PAID' ? new Date() : null },
  }).catch((err) => {
    if (err.code === 'P2025') return null;
    throw err;
  });
  if (!invoice) {
    return res.status(404).json({ success: false, message: `Invoice ${invoiceId} not found.` });
  }
  return res.status(200).json({ success: true, data: invoice });
}

/** GET /api/payments/stripe/ledger/summary — platform-wide, for the Super Admin dashboard (Phase 2) */
async function getPlatformSummary(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;

  const hospitalFilter = scope.hospitalId ? { hospitalId: scope.hospitalId } : {};

  const [unpaid, paid] = await Promise.all([
    prisma.commissionInvoice.aggregate({ where: { ...hospitalFilter, status: 'UNPAID' }, _sum: { totalDue: true }, _count: true }),
    prisma.commissionInvoice.aggregate({ where: { ...hospitalFilter, status: 'PAID' }, _sum: { totalDue: true }, _count: true }),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      commissionOwed: Number(unpaid._sum.totalDue || 0),
      unpaidInvoiceCount: unpaid._count,
      commissionCollected: Number(paid._sum.totalDue || 0),
      paidInvoiceCount: paid._count,
    },
  });
}

/** GET /api/payments/stripe/refunds?status=PENDING */
async function listRefunds(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { status } = req.query;

  const where = {};
  if (status) where.status = status;
  if (scope.hospitalId) where.transaction = { hospitalId: scope.hospitalId };

  const refunds = await prisma.refund.findMany({
    where,
    include: {
      transaction: {
        select: { id: true, hospitalId: true, appointmentId: true, grossAmount: true, currency: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return res.status(200).json({ success: true, data: refunds });
}

/** GET /api/payments/stripe/disputes?status=NEEDS_RESPONSE */
async function listDisputes(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { status } = req.query;

  const where = {};
  if (status) where.status = status;
  if (scope.hospitalId) where.transaction = { hospitalId: scope.hospitalId };

  const disputes = await prisma.dispute.findMany({
    where,
    include: {
      transaction: {
        select: { id: true, hospitalId: true, appointmentId: true, grossAmount: true, currency: true },
      },
    },
    // Soonest deadline first — the whole reason this endpoint exists is so
    // nothing with a real evidence-submission deadline gets missed.
    orderBy: { evidenceDueBy: 'asc' },
    take: 200,
  });

  return res.status(200).json({ success: true, data: disputes });
}

/** GET /api/payments/stripe/invoices?status=UNPAID */
async function listAllInvoices(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { status } = req.query;

  const where = {};
  if (status) where.status = status;
  if (scope.hospitalId) where.hospitalId = scope.hospitalId;

  const invoices = await prisma.commissionInvoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return res.status(200).json({ success: true, data: invoices });
}

module.exports = { getHospitalLedger, getHospitalInvoices, getInvoiceById, updateInvoiceStatus, getPlatformSummary, listRefunds, listDisputes, listAllInvoices };


