'use strict';

const prisma = require('../config/prismaClient');
const { requirePatient, getPagination } = require('../utils/roleGuards');

/**
 * GET /api/payments/stripe/patient/transactions
 * Lists authenticated patient's payment transactions with filters and pagination.
 */
async function listPatientTransactions(req, res) {
  const patient = requirePatient(req, res);
  if (!patient) return;

  const { status, consultationType, startDate, endDate } = req.query;
  const { page, limit, skip, take } = getPagination(req, 10, 50);

  const where = { patientId: patient.patientId };

  if (status) {
    where.status = (status === 'PAID' ? 'SUCCESS' : status);
  }

  if (consultationType) {
    where.consultationType = consultationType;
  }

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [transactions, totalCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        refunds: {
          select: {
            id: true,
            amount: true,
            reason: true,
            reasonCategory: true,
            status: true,
            receiptUrl: true,
            processedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.transaction.count({ where }),
  ]);

  // Clean presentation for patient (hide internal platform commission & hospital net amounts)
  const formatted = transactions.map((t) => ({
    id: t.id,
    appointmentId: t.appointmentId,
    doctorName: t.doctorName,
    doctorSpecialty: t.doctorSpecialty,
    hospitalName: t.hospitalName,
    consultationType: t.consultationType,
    amount: Number(t.grossAmount),
    currency: t.currency.toUpperCase(),
    status: t.status === 'SUCCESS' ? 'PAID' : t.status,
    paymentMethodType: t.paymentMethodType,
    cardBrand: t.cardBrand,
    cardLast4: t.cardLast4,
    receiptUrl: t.receiptUrl,
    paidAt: t.paidAt,
    createdAt: t.createdAt,
    refunds: t.refunds.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      receiptUrl: r.receiptUrl,
      processedAt: r.processedAt,
      createdAt: r.createdAt,
    })),
  }));

  return res.status(200).json({
    success: true,
    data: {
      transactions: formatted,
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
 * GET /api/payments/stripe/patient/transactions/:id
 * Retrieves single transaction details for the authenticated patient.
 */
async function getPatientTransactionById(req, res) {
  const patient = requirePatient(req, res);
  if (!patient) return;

  const { id } = req.params;

  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      refunds: {
        select: {
          id: true,
          amount: true,
          reason: true,
          reasonCategory: true,
          status: true,
          receiptUrl: true,
          processedAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!transaction || transaction.patientId !== patient.patientId) {
    return res.status(404).json({
      success: false,
      message: `Transaction ${id} not found.`,
    });
  }

  const formatted = {
    id: transaction.id,
    appointmentId: transaction.appointmentId,
    doctorName: transaction.doctorName,
    doctorSpecialty: transaction.doctorSpecialty,
    hospitalName: transaction.hospitalName,
    consultationType: transaction.consultationType,
    amount: Number(transaction.grossAmount),
    currency: transaction.currency.toUpperCase(),
    status: transaction.status === 'SUCCESS' ? 'PAID' : transaction.status,
    paymentMethodType: transaction.paymentMethodType,
    cardBrand: transaction.cardBrand,
    cardLast4: transaction.cardLast4,
    receiptUrl: transaction.receiptUrl,
    paidAt: transaction.paidAt,
    createdAt: transaction.createdAt,
    refunds: transaction.refunds.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      reason: r.reason,
      status: r.status,
      receiptUrl: r.receiptUrl,
      processedAt: r.processedAt,
      createdAt: r.createdAt,
    })),
  };

  return res.status(200).json({
    success: true,
    data: formatted,
  });
}

/**
 * GET /api/payments/stripe/patient/refunds
 * Lists all refunds for the authenticated patient.
 */
async function listPatientRefunds(req, res) {
  const patient = requirePatient(req, res);
  if (!patient) return;

  const { page, limit, skip, take } = getPagination(req, 10, 50);

  const where = {
    transaction: { patientId: patient.patientId },
  };

  const [refunds, totalCount] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            appointmentId: true,
            doctorName: true,
            hospitalName: true,
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
    hospitalName: r.transaction?.hospitalName,
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
  listPatientTransactions,
  getPatientTransactionById,
  listPatientRefunds,
};
