'use strict';

const prisma = require('../config/prismaClient');
const { requireHospitalAdmin, getPagination } = require('../utils/roleGuards');
const { syncRefundsForTransaction } = require('../services/reconciliation.service');

/**
 * GET /api/payments/stripe/hospital/transactions
 * Lists transactions scoped strictly to caller's hospital with comprehensive filters.
 */
async function listHospitalTransactions(req, res) {
  const auth = requireHospitalAdmin(req, res);
  if (!auth) return;

  const { hospitalId } = auth;
  const { status, doctorId, consultationType, startDate, endDate, search } = req.query;
  const { page, limit, skip, take } = getPagination(req, 20, 100);

  const where = { hospitalId };

  if (status) {
    where.status = (status === 'PAID' ? 'SUCCESS' : status);
  }

  if (doctorId) {
    where.doctorId = doctorId;
  }

  if (consultationType) {
    where.consultationType = consultationType;
  }

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
      { doctorName: { contains: q, mode: 'insensitive' } },
      { patientName: { contains: q, mode: 'insensitive' } },
      { patientEmail: { contains: q, mode: 'insensitive' } },
      { stripePaymentIntentId: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [transactions, totalCount, totals] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        refunds: true,
        disputes: true,
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

  const formatted = transactions.map((t) => {
    const totalRefunded = (t.refunds || [])
      .filter((r) => ['PROCESSED', 'PROCESSING', 'SUBMITTED_TO_PSP', 'COMPLETED', 'PENDING'].includes(r.status))
      .reduce((acc, r) => acc + Number(r.amount), 0);
    const gross = Number(t.grossAmount);
    const comm = Number(t.commissionAmount);
    const net = Number(t.hospitalNetAmount);
    const fee = Number(t.stripeFeeAmount);

    return {
      id: t.id,
      appointmentId: t.appointmentId,
      patientId: t.patientId,
      patientName: t.patientName,
      patientEmail: t.patientEmail,
      doctorId: t.doctorId,
      doctorName: t.doctorName,
      doctorSpecialty: t.doctorSpecialty,
      consultationType: t.consultationType,
      grossAmount: gross,
      hospitalNetAmount: net,
      commissionAmount: comm,
      stripeFeeAmount: fee,
      // Frontend aliases for full compatibility
      netAmount: net,
      platformCommission: comm,
      stripeProcessingFee: fee,
      totalRefunded,
      netRetained: Math.max(0, gross - totalRefunded),
      currency: t.currency.toUpperCase(),
      paymentFlow: t.paymentFlow || (t.stripeCheckoutSessionId ? 'CHECKOUT_URL' : 'PAYMENT_INTENT'),
      status: t.status === 'SUCCESS' ? 'PAID' : t.status,
      paymentMethodType: t.paymentMethodType,
      cardBrand: t.cardBrand,
      cardLast4: t.cardLast4,
      receiptUrl: t.receiptUrl,
      stripePaymentIntentId: t.stripePaymentIntentId,
      paidAt: t.paidAt,
      createdAt: t.createdAt,
      refunds: t.refunds.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        reason: r.reason,
        reasonCategory: r.reasonCategory,
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
    };
  });

  return res.status(200).json({
    success: true,
    data: {
      transactions: formatted,
      summary: {
        totalGross: Number(totals._sum.grossAmount || 0),
        totalNet: Number(totals._sum.hospitalNetAmount || 0),
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
 * GET /api/payments/stripe/hospital/transactions/:id
 * Single transaction details scoped to hospital.
 */
async function getHospitalTransactionById(req, res) {
  const auth = requireHospitalAdmin(req, res);
  if (!auth) return;

  const { id } = req.params;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      refunds: true,
      disputes: true,
    },
  });

  if (!transaction || transaction.hospitalId !== auth.hospitalId) {
    return res.status(404).json({
      success: false,
      message: `Transaction ${id} not found.`,
    });
  }

  // Actively sync any unfinalized refunds with Stripe
  const syncedTransaction = await syncRefundsForTransaction(transaction);

  return res.status(200).json({
    success: true,
    data: {
      ...syncedTransaction,
      status: syncedTransaction.status === 'SUCCESS' ? 'PAID' : syncedTransaction.status,
      grossAmount: Number(syncedTransaction.grossAmount),
      hospitalNetAmount: Number(syncedTransaction.hospitalNetAmount),
      netAmount: Number(syncedTransaction.hospitalNetAmount),
      commissionAmount: Number(syncedTransaction.commissionAmount),
      platformCommission: Number(syncedTransaction.commissionAmount),
      stripeFeeAmount: Number(syncedTransaction.stripeFeeAmount),
      stripeProcessingFee: Number(syncedTransaction.stripeFeeAmount),
      totalRefunded: (syncedTransaction.refunds || [])
        .filter((r) => ['PROCESSED', 'COMPLETED', 'PROCESSING', 'SUBMITTED_TO_PSP'].includes(r.status))
        .reduce((sum, r) => sum + Number(r.amount), 0),
      netRetained: Math.max(0, Number(syncedTransaction.grossAmount) - (syncedTransaction.refunds || [])
        .filter((r) => ['PROCESSED', 'COMPLETED', 'PROCESSING', 'SUBMITTED_TO_PSP'].includes(r.status))
        .reduce((sum, r) => sum + Number(r.amount), 0)),
      refunds: syncedTransaction.refunds.map((r) => ({ ...r, amount: Number(r.amount) })),
      disputes: syncedTransaction.disputes.map((d) => ({ ...d, amount: Number(d.amount) })),
    },
  });
}

/**
 * GET /api/payments/stripe/hospital/stats
 * Financial overview metrics for hospital dashboard.
 */
async function getHospitalStats(req, res) {
  const auth = requireHospitalAdmin(req, res);
  if (!auth) return;

  const { hospitalId } = auth;
  const { startDate, endDate } = req.query;

  const where = { hospitalId };
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [volumeAgg, countByStatus, refundAgg, disputeCount] = await Promise.all([
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
    prisma.refund.aggregate({
      where: {
        transaction: { hospitalId },
        status: { in: ['PROCESSED', 'PROCESSING', 'SUBMITTED_TO_PSP', 'COMPLETED', 'PENDING'] },
        ...(startDate || endDate ? { createdAt: where.createdAt } : {}),
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.dispute.count({
      where: {
        transaction: { hospitalId },
        status: { in: ['NEEDS_RESPONSE', 'UNDER_REVIEW'] },
      },
    }),
  ]);

  const totalGross = Number(volumeAgg._sum.grossAmount || 0);
  const totalRefunds = Number(refundAgg._sum.amount || 0);
  const rawHospitalNet = Number(volumeAgg._sum.hospitalNetAmount || 0);
  const netRevenueAfterRefunds = Math.max(0, rawHospitalNet - totalRefunds);
  const totalRetainedVolume = Math.max(0, totalGross - totalRefunds);

  const statusMap = countByStatus.reduce((acc, curr) => {
    acc[curr.status] = curr._count;
    return acc;
  }, {});

  return res.status(200).json({
    success: true,
    data: {
      totalGross,
      totalNetRevenue: netRevenueAfterRefunds,
      totalCommissionIncurred: Number(volumeAgg._sum.commissionAmount || 0),
      totalStripeFees: Number(volumeAgg._sum.stripeFeeAmount || 0),
      paidTransactionsCount: volumeAgg._count,
      totalRefundsAmount: totalRefunds,
      processedRefundsCount: refundAgg._count,
      activeDisputesCount: disputeCount,
      transactionsByStatus: statusMap,

      // Aliases for frontend compatibility (HospitalPaymentStats)
      totalVolume: totalGross,
      retainedVolume: totalRetainedVolume,
      hospitalNet: netRevenueAfterRefunds,
      platformCommission: Number(volumeAgg._sum.commissionAmount || 0),
      stripeProcessingFee: Number(volumeAgg._sum.stripeFeeAmount || 0),
      totalTransactions: volumeAgg._count,
      paidCount: volumeAgg._count,
      refundedCount: refundAgg._count,
    },
  });
}

/**
 * GET /api/payments/stripe/hospital/refunds
 * List refunds for hospital transactions.
 */
async function listHospitalRefunds(req, res) {
  const auth = requireHospitalAdmin(req, res);
  if (!auth) return;

  const { status, reasonCategory, startDate, endDate } = req.query;
  const { page, limit, skip, take } = getPagination(req, 20, 100);

  const where = {
    transaction: { hospitalId: auth.hospitalId },
  };

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
            doctorName: true,
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
  listHospitalTransactions,
  getHospitalTransactionById,
  getHospitalStats,
  listHospitalRefunds,
};
