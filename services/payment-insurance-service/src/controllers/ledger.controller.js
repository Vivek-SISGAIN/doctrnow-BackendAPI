'use strict';

const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin } = require('../utils/roleGuards');

/** GET /api/payments/stripe/hospitals/:hospitalId/ledger?startDate&endDate */
async function getHospitalLedger(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { hospitalId } = req.params;
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
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { hospitalId } = req.params;
  const invoices = await prisma.commissionInvoice.findMany({
    where: { hospitalId },
    orderBy: { periodStart: 'desc' },
  });
  return res.status(200).json({ success: true, data: invoices });
}

/** GET /api/payments/stripe/invoices/:invoiceId */
async function getInvoiceById(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { invoiceId } = req.params;
  const invoice = await prisma.commissionInvoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: true },
  });
  if (!invoice) {
    return res.status(404).json({ success: false, message: `Invoice ${invoiceId} not found.` });
  }
  return res.status(200).json({ success: true, data: invoice });
}

/** PATCH /api/payments/stripe/invoices/:invoiceId/status  Body: { status: "PAID" | "OVERDUE" } */
async function updateInvoiceStatus(req, res) {
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
  if (rejectIfNotSuperAdmin(req, res)) return;

  const [unpaid, paid] = await Promise.all([
    prisma.commissionInvoice.aggregate({ where: { status: 'UNPAID' }, _sum: { totalDue: true }, _count: true }),
    prisma.commissionInvoice.aggregate({ where: { status: 'PAID' }, _sum: { totalDue: true }, _count: true }),
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

module.exports = { getHospitalLedger, getHospitalInvoices, getInvoiceById, updateInvoiceStatus, getPlatformSummary };
