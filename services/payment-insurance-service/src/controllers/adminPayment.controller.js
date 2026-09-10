'use strict';

const prisma = require('../config/prismaClient');
const { requireSuperAdmin, getPagination } = require('../utils/roleGuards');

/**
 * GET /api/payments/stripe/admin/transactions
 * Platform-wide transaction exploration with deep filtering, search, and pagination.
 */
async function listAdminTransactions(req, res) {
  if (!requireSuperAdmin(req, res)) return;

  const {
    hospitalId,
    doctorId,
    patientId,
    status,
    consultationType,
    startDate,
    endDate,
    search,
  } = req.query;

  const { page, limit, skip, take } = getPagination(req, 20, 100);

  const where = {};

  if (hospitalId) where.hospitalId = hospitalId;
  if (doctorId) where.doctorId = doctorId;
  if (patientId) where.patientId = patientId;
  if (status) where.status = (status === 'PAID' ? 'SUCCESS' : status);
  if (consultationType) where.consultationType = consultationType;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { id: { contains: q, mode: 'insensitive' } },
      { appointmentId: { contains: q, mode: 'insensitive' } },
      { hospitalName: { contains: q, mode: 'insensitive' } },
      { doctorName: { contains: q, mode: 'insensitive' } },
      { patientName: { contains: q, mode: 'insensitive' } },
      { patientEmail: { contains: q, mode: 'insensitive' } },
      { stripePaymentIntentId: { contains: q, mode: 'insensitive' } },
      { stripeCheckoutSessionId: { contains: q, mode: 'insensitive' } },
      { stripeConnectedAccountId: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [transactions, totalCount, totals] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        refunds: true,
        disputes: true,
        commissionInvoice: {
          select: { id: true, status: true, periodStart: true, periodEnd: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({
      where,
      _sum: {
        grossAmount: true,
        hospitalNetAmount: true,
        commissionAmount: true,
        stripeFeeAmount: true,
      },
    }),
  ]);

  const formatted = transactions.map((t) => ({
    id: t.id,
    appointmentId: t.appointmentId,
    hospitalId: t.hospitalId,
    hospitalName: t.hospitalName,
    doctorId: t.doctorId,
    doctorName: t.doctorName,
    doctorSpecialty: t.doctorSpecialty,
    patientId: t.patientId,
    patientName: t.patientName,
    patientEmail: t.patientEmail,
    consultationType: t.consultationType,
    grossAmount: Number(t.grossAmount),
    hospitalNetAmount: Number(t.hospitalNetAmount),
    commissionAmount: Number(t.commissionAmount),
    stripeFeeAmount: Number(t.stripeFeeAmount),
    currency: t.currency.toUpperCase(),
    status: t.status === 'SUCCESS' ? 'PAID' : t.status,
    paymentMethodType: t.paymentMethodType,
    cardBrand: t.cardBrand,
    cardLast4: t.cardLast4,
    receiptUrl: t.receiptUrl,
    stripePaymentIntentId: t.stripePaymentIntentId,
    stripeCheckoutSessionId: t.stripeCheckoutSessionId,
    stripeConnectedAccountId: t.stripeConnectedAccountId,
    commissionInvoice: t.commissionInvoice,
    paidAt: t.paidAt,
    createdAt: t.createdAt,
    refunds: t.refunds.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      receiptUrl: r.receiptUrl,
      createdAt: r.createdAt,
    })),
    disputes: t.disputes.map((d) => ({
      id: d.id,
      amount: Number(d.amount),
      status: d.status,
      reason: d.reason,
      createdAt: d.createdAt,
    })),
  }));

  return res.status(200).json({
    success: true,
    data: {
      transactions: formatted,
      summary: {
        totalGross: Number(totals._sum.grossAmount || 0),
        totalHospitalNet: Number(totals._sum.hospitalNetAmount || 0),
        totalCommission: Number(totals._sum.commissionAmount || 0),
        totalStripeFee: Number(totals._sum.stripeFeeAmount || 0),
      },
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    },
  });
}

/**
 * GET /api/payments/stripe/admin/transactions/:id
 * Full transaction detail for Super Admin.
 */
async function getAdminTransactionById(req, res) {
  if (!requireSuperAdmin(req, res)) return;

  const { id } = req.params;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      refunds: true,
      disputes: true,
      commissionInvoice: true,
    },
  });

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: `Transaction ${id} not found.`,
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      ...transaction,
      status: transaction.status === 'SUCCESS' ? 'PAID' : transaction.status,
      grossAmount: Number(transaction.grossAmount),
      hospitalNetAmount: Number(transaction.hospitalNetAmount),
      commissionAmount: Number(transaction.commissionAmount),
      stripeFeeAmount: Number(transaction.stripeFeeAmount),
      refunds: transaction.refunds.map((r) => ({ ...r, amount: Number(r.amount) })),
      disputes: transaction.disputes.map((d) => ({ ...d, amount: Number(d.amount) })),
    },
  });
}

/**
 * GET /api/payments/stripe/admin/stats
 * Platform-wide executive analytics for Super Admin.
 */
async function getAdminStats(req, res) {
  if (!requireSuperAdmin(req, res)) return;

  const { startDate, endDate } = req.query;

  const where = {};
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [volumeAgg, countByStatus, invoicesSummary, refundAgg, disputeCount, hospitalBreakdown] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      _sum: {
        grossAmount: true,
        hospitalNetAmount: true,
        commissionAmount: true,
        stripeFeeAmount: true,
      },
      _count: true,
    }),
    prisma.transaction.groupBy({
      by: ['status'],
      where,
      _count: true,
    }),
    prisma.commissionInvoice.groupBy({
      by: ['status'],
      _sum: { totalDue: true },
      _count: true,
    }),
    prisma.refund.aggregate({
      where: {
        status: 'PROCESSED',
        ...(startDate || endDate ? { createdAt: where.createdAt } : {}),
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.dispute.count({
      where: { status: { in: ['NEEDS_RESPONSE', 'UNDER_REVIEW'] } },
    }),
    prisma.transaction.groupBy({
      by: ['hospitalId', 'hospitalName'],
      where: { ...where, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      _sum: { grossAmount: true, commissionAmount: true },
      _count: true,
      orderBy: { _sum: { grossAmount: 'desc' } },
      take: 10,
    }),
  ]);

  const invoiceMap = invoicesSummary.reduce((acc, curr) => {
    acc[curr.status] = {
      totalDue: Number(curr._sum.totalDue || 0),
      count: curr._count,
    };
    return acc;
  }, {
    PAID: { totalDue: 0, count: 0 },
    UNPAID: { totalDue: 0, count: 0 },
    OVERDUE: { totalDue: 0, count: 0 },
  });

  const statusMap = countByStatus.reduce((acc, curr) => {
    acc[curr.status] = curr._count;
    return acc;
  }, {});

  return res.status(200).json({
    success: true,
    data: {
      totalGrossPlatformVolume: Number(volumeAgg._sum.grossAmount || 0),
      totalPlatformCommissionEarned: Number(volumeAgg._sum.commissionAmount || 0),
      totalHospitalNetDisbursed: Number(volumeAgg._sum.hospitalNetAmount || 0),
      totalStripeFees: Number(volumeAgg._sum.stripeFeeAmount || 0),
      paidTransactionsCount: volumeAgg._count,
      totalRefundedAmount: Number(refundAgg._sum.amount || 0),
      processedRefundsCount: refundAgg._count,
      activeDisputesCount: disputeCount,
      invoicesSummary: invoiceMap,
      transactionsByStatus: statusMap,
      topHospitals: hospitalBreakdown.map((h) => ({
        hospitalId: h.hospitalId,
        hospitalName: h.hospitalName || 'Unknown',
        grossVolume: Number(h._sum.grossAmount || 0),
        commissionEarned: Number(h._sum.commissionAmount || 0),
        transactionCount: h._count,
      })),
    },
  });
}

/**
 * GET /api/payments/stripe/admin/refunds
 * Platform-wide refund listing with filters.
 */
async function listAdminRefunds(req, res) {
  if (!requireSuperAdmin(req, res)) return;

  const { hospitalId, status, reasonCategory, startDate, endDate } = req.query;
  const { page, limit, skip, take } = getPagination(req, 20, 100);

  const where = {};
  if (hospitalId) where.transaction = { hospitalId };
  if (status) where.status = status;
  if (reasonCategory) where.reasonCategory = reasonCategory;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [refunds, totalCount] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            appointmentId: true,
            hospitalId: true,
            hospitalName: true,
            doctorId: true,
            doctorName: true,
            patientId: true,
            patientName: true,
            patientEmail: true,
            grossAmount: true,
            currency: true,
            receiptUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.refund.count({ where }),
  ]);

  const formatted = refunds.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    appointmentId: r.transaction?.appointmentId,
    hospitalId: r.transaction?.hospitalId,
    hospitalName: r.transaction?.hospitalName,
    doctorName: r.transaction?.doctorName,
    patientName: r.transaction?.patientName,
    patientEmail: r.transaction?.patientEmail,
    amount: Number(r.amount),
    currency: (r.transaction?.currency || 'AED').toUpperCase(),
    reason: r.reason,
    reasonCategory: r.reasonCategory,
    status: r.status,
    receiptUrl: r.receiptUrl || r.transaction?.receiptUrl,
    processedAt: r.processedAt,
    createdAt: r.createdAt,
    initiatedBy: r.initiatedBy,
    initiatedByRole: r.initiatedByRole,
  }));

  return res.status(200).json({
    success: true,
    data: {
      refunds: formatted,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    },
  });
}

module.exports = {
  listAdminTransactions,
  getAdminTransactionById,
  getAdminStats,
  listAdminRefunds,
};
