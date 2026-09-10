'use strict';

const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin, resolveReadScope } = require('../utils/roleGuards');
const { generateDueCommissionInvoices, generateInvoiceManualForHospital } = require('../jobs/generateCommissionInvoices');

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

/** GET /api/payments/stripe/ledger/hospitals — Super Admin commission ledger across all hospitals */
async function getHospitalsCommissionLedger(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;

  // 1. Group transactions by hospital to get total consultations, volume, and total accrued commission
  const txAgg = await prisma.transaction.groupBy({
    by: ['hospitalId'],
    where: { status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
    _sum: {
      grossAmount: true,
      commissionAmount: true,
    },
    _count: {
      id: true,
    },
  });

  // 2. Aggregate invoices by hospital and status to get collected (PAID), pending review (PAYMENT_SUBMITTED), and unpaid
  const invAgg = await prisma.commissionInvoice.groupBy({
    by: ['hospitalId', 'status'],
    _sum: {
      totalDue: true,
    },
    _count: {
      id: true,
    },
  });

  // 3. Unbilled transactions (not yet in an invoice)
  const unbilledAgg = await prisma.transaction.groupBy({
    by: ['hospitalId'],
    where: {
      commissionInvoiceId: null,
      status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
    },
    _sum: {
      commissionAmount: true,
    },
    _count: {
      id: true,
    },
  });

  // Fetch hospital names snapshot from recent transactions or invoices
  const hospitalNames = await prisma.transaction.findMany({
    where: { hospitalName: { not: null } },
    distinct: ['hospitalId'],
    select: { hospitalId: true, hospitalName: true },
  });
  const nameMap = {};
  hospitalNames.forEach((h) => {
    if (h.hospitalName) nameMap[h.hospitalId] = h.hospitalName;
  });

  const hospitalMap = {};

  txAgg.forEach((t) => {
    hospitalMap[t.hospitalId] = {
      hospitalId: t.hospitalId,
      hospitalName: nameMap[t.hospitalId] || null,
      totalConsultations: t._count.id || 0,
      grossVolume: Number(t._sum.grossAmount || 0),
      totalCommissionAccrued: Number(t._sum.commissionAmount || 0),
      commissionPaid: 0,
      commissionPendingReview: 0,
      commissionUnpaidInvoices: 0,
      unbilledCommission: 0,
      unbilledTransactionsCount: 0,
      unpaidInvoicesCount: 0,
    };
  });

  invAgg.forEach((inv) => {
    if (!hospitalMap[inv.hospitalId]) {
      hospitalMap[inv.hospitalId] = {
        hospitalId: inv.hospitalId,
        hospitalName: nameMap[inv.hospitalId] || null,
        totalConsultations: 0,
        grossVolume: 0,
        totalCommissionAccrued: 0,
        commissionPaid: 0,
        commissionPendingReview: 0,
        commissionUnpaidInvoices: 0,
        unbilledCommission: 0,
        unbilledTransactionsCount: 0,
        unpaidInvoicesCount: 0,
      };
    }
    const due = Number(inv._sum.totalDue || 0);
    if (inv.status === 'PAID') {
      hospitalMap[inv.hospitalId].commissionPaid += due;
    } else if (inv.status === 'PAYMENT_SUBMITTED') {
      hospitalMap[inv.hospitalId].commissionPendingReview += due;
    } else if (inv.status === 'UNPAID' || inv.status === 'OVERDUE') {
      hospitalMap[inv.hospitalId].commissionUnpaidInvoices += due;
      hospitalMap[inv.hospitalId].unpaidInvoicesCount += inv._count.id || 0;
    }
  });

  unbilledAgg.forEach((u) => {
    if (hospitalMap[u.hospitalId]) {
      hospitalMap[u.hospitalId].unbilledCommission = Number(u._sum.commissionAmount || 0);
      hospitalMap[u.hospitalId].unbilledTransactionsCount = u._count.id || 0;
    }
  });

  // Calculate remaining balance for each hospital:
  // Remaining = totalCommissionAccrued - commissionPaid
  const hospitalLedgers = Object.values(hospitalMap).map((h) => {
    const commissionRemaining = Math.max(0, h.totalCommissionAccrued - h.commissionPaid);
    return {
      ...h,
      commissionRemaining,
    };
  });

  return res.status(200).json({ success: true, data: hospitalLedgers });
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
/** GET /api/payments/stripe/invoices/:invoiceId */
async function getInvoiceById(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { invoiceId } = req.params;
  const invoice = await prisma.commissionInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      lineItems: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!invoice || (scope.hospitalId && invoice.hospitalId !== scope.hospitalId)) {
    return res.status(404).json({ success: false, message: `Invoice ${invoiceId} not found.` });
  }
  return res.status(200).json({ success: true, data: invoice });
}

/** POST /api/payments/stripe/invoices/:invoiceId/submit-payment */
async function submitInvoicePayment(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { invoiceId } = req.params;
  const { paymentMethod, paymentReference, paymentReceiptUrl, paymentNotes } = req.body;

  if (!paymentReference || !paymentReference.trim()) {
    return res.status(400).json({ success: false, message: 'paymentReference (bank transfer reference/UTR) is required.' });
  }

  const existing = await prisma.commissionInvoice.findUnique({
    where: { id: invoiceId },
  });
  if (!existing) {
    return res.status(404).json({ success: false, message: `Invoice ${invoiceId} not found.` });
  }

  if (scope.hospitalId && existing.hospitalId !== scope.hospitalId) {
    return res.status(403).json({ success: false, message: "Forbidden: you can only submit payment for your hospital's invoices." });
  }

  if (existing.status === 'PAID') {
    return res.status(400).json({ success: false, message: 'This invoice has already been paid and acknowledged.' });
  }

  const updated = await prisma.commissionInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'PAYMENT_SUBMITTED',
      paymentMethod: paymentMethod || 'BANK_TRANSFER',
      paymentReference: paymentReference.trim(),
      paymentReceiptUrl: paymentReceiptUrl || null,
      paymentNotes: paymentNotes || null,
      paymentSubmittedAt: new Date(),
      paymentSubmittedBy: req.headers['x-user-email'] || req.headers['x-user-id'] || 'HOSPITAL_ADMIN',
      rejectionReason: null,
    },
  });

  return res.status(200).json({
    success: true,
    message: 'Payment details submitted successfully. Status is now pending verification by DoctorNow Super Admin.',
    data: updated,
  });
}

/** POST /api/payments/stripe/invoices/:invoiceId/acknowledge-payment */
async function acknowledgeInvoicePayment(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { invoiceId } = req.params;
  const { action, notes, rejectionReason } = req.body;

  if (!['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ success: false, message: 'action must be either "APPROVE" or "REJECT".' });
  }

  const existing = await prisma.commissionInvoice.findUnique({
    where: { id: invoiceId },
  });
  if (!existing) {
    return res.status(404).json({ success: false, message: `Invoice ${invoiceId} not found.` });
  }

  if (action === 'APPROVE') {
    const adminUser = req.headers['x-user-name'] || req.headers['x-user-email'] || 'SUPER_ADMIN';
    const updated = await prisma.commissionInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        acknowledgedBy: adminUser,
        acknowledgedAt: new Date(),
        acknowledgmentNotes: notes || null,
        rejectionReason: null,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Payment verified and acknowledged. Invoice marked as PAID.',
      data: updated,
    });
  } else {
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ success: false, message: 'rejectionReason is required when rejecting payment.' });
    }

    const updated = await prisma.commissionInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'UNPAID',
        rejectionReason: rejectionReason.trim(),
        acknowledgmentNotes: notes || null,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Payment submission rejected. Invoice reverted to UNPAID status.',
      data: updated,
    });
  }
}

/** POST /api/payments/stripe/invoices/generate */
async function generateInvoiceManual(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { hospitalId, periodStart, periodEnd } = req.body;

  if (hospitalId) {
    const result = await generateInvoiceManualForHospital(hospitalId, periodStart, periodEnd);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }
    return res.status(201).json({ success: true, data: result.invoice, lineItemsCount: result.lineItemsCount });
  } else {
    const result = await generateDueCommissionInvoices();
    return res.status(200).json({ success: true, data: result });
  }
}

/** PATCH /api/payments/stripe/invoices/:invoiceId/status  Body: { status: "PAID" | "OVERDUE" } */
async function updateInvoiceStatus(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { invoiceId } = req.params;
  const { status } = req.body;
  if (!['PAID', 'OVERDUE', 'UNPAID'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status must be "PAID", "OVERDUE", or "UNPAID".' });
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

  const [unpaid, submitted, paid, overdue] = await Promise.all([
    prisma.commissionInvoice.aggregate({ where: { ...hospitalFilter, status: 'UNPAID' }, _sum: { totalDue: true }, _count: true }),
    prisma.commissionInvoice.aggregate({ where: { ...hospitalFilter, status: 'PAYMENT_SUBMITTED' }, _sum: { totalDue: true }, _count: true }),
    prisma.commissionInvoice.aggregate({ where: { ...hospitalFilter, status: 'PAID' }, _sum: { totalDue: true }, _count: true }),
    prisma.commissionInvoice.aggregate({ where: { ...hospitalFilter, status: 'OVERDUE' }, _sum: { totalDue: true }, _count: true }),
  ]);

  const commissionOwed = Number(unpaid._sum.totalDue || 0) + Number(submitted._sum.totalDue || 0) + Number(overdue._sum.totalDue || 0);

  return res.status(200).json({
    success: true,
    data: {
      commissionOwed,
      unpaidInvoiceCount: (unpaid._count || 0) + (overdue._count || 0),
      paymentSubmittedCount: submitted._count || 0,
      paymentSubmittedAmount: Number(submitted._sum.totalDue || 0),
      commissionCollected: Number(paid._sum.totalDue || 0),
      paidInvoiceCount: paid._count || 0,
      overdueInvoiceCount: overdue._count || 0,
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

module.exports = {
  getHospitalLedger,
  getHospitalsCommissionLedger,
  getHospitalInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  submitInvoicePayment,
  acknowledgeInvoicePayment,
  generateInvoiceManual,
  getPlatformSummary,
  listRefunds,
  listDisputes,
  listAllInvoices,
};


