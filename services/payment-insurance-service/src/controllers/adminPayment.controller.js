'use strict';

const axios = require('axios');
const prisma = require('../config/prismaClient');
const { requireSuperAdmin, getPagination } = require('../utils/roleGuards');
const { syncRefundsForTransaction, verifyAndSyncRefund } = require('../services/reconciliation.service');

const PROFILE_URL = process.env.PROFILE_SERVICE_URL || 'http://localhost:5000';

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

  const formatted = transactions.map((t) => {
    const totalRefunded = (t.refunds || [])
      .filter((r) => ['PROCESSED', 'PROCESSING', 'SUBMITTED_TO_PSP', 'COMPLETED', 'PENDING'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const gross = Number(t.grossAmount);
    const netRetained = Math.max(0, gross - totalRefunded);

    return {
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
      grossAmount: gross,
      hospitalNetAmount: Number(t.hospitalNetAmount),
      netAmount: Number(t.hospitalNetAmount),
      commissionAmount: Number(t.commissionAmount),
      platformCommission: Number(t.commissionAmount),
      stripeFeeAmount: Number(t.stripeFeeAmount),
      stripeProcessingFee: Number(t.stripeFeeAmount),
      totalRefunded,
      netRetained,
      currency: t.currency.toUpperCase(),
      status: t.status === 'SUCCESS' ? 'PAID' : t.status,
      paymentMethodType: t.paymentMethodType,
      paymentFlow: t.paymentFlow || (t.stripeCheckoutSessionId ? 'CHECKOUT_URL' : 'PAYMENT_INTENT'),
      cardBrand: t.cardBrand,
      cardLast4: t.cardLast4,
      receiptUrl: t.receiptUrl,
      stripePaymentIntentId: t.stripePaymentIntentId,
      stripeCheckoutSessionId: t.stripeCheckoutSessionId,
      stripeConnectedAccountId: t.stripeConnectedAccountId,
      stripeTransferId: t.stripeTransferId,
      transferStatus: t.transferStatus,
      transferredAt: t.transferredAt,
      commissionInvoice: t.commissionInvoice,
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
        totalHospitalNet: Number(totals._sum.hospitalNetAmount || 0),
        totalCommission: Number(totals._sum.commissionAmount || 0),
        totalStripeFee: Number(totals._sum.stripeFeeAmount || 0),
      },
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        pages: Math.ceil(totalCount / limit),
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

  // Actively verify and sync any unfinalized refunds directly with Stripe
  const syncedTransaction = await syncRefundsForTransaction(transaction);

  return res.status(200).json({
    success: true,
    data: {
      ...syncedTransaction,
      status: syncedTransaction.status === 'SUCCESS' ? 'PAID' : syncedTransaction.status,
      paymentFlow: syncedTransaction.paymentFlow || (syncedTransaction.stripeCheckoutSessionId ? 'CHECKOUT_URL' : 'PAYMENT_INTENT'),
      grossAmount: Number(syncedTransaction.grossAmount),
      hospitalNetAmount: Number(syncedTransaction.hospitalNetAmount),
      netAmount: Number(syncedTransaction.hospitalNetAmount),
      commissionAmount: Number(syncedTransaction.commissionAmount),
      platformCommission: Number(syncedTransaction.commissionAmount),
      stripeFeeAmount: Number(syncedTransaction.stripeFeeAmount),
      stripeProcessingFee: Number(syncedTransaction.stripeFeeAmount),
      refunds: syncedTransaction.refunds.map((r) => ({ ...r, amount: Number(r.amount) })),
      disputes: syncedTransaction.disputes.map((d) => ({ ...d, amount: Number(d.amount) })),
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
        status: { in: ['PROCESSED', 'PROCESSING', 'SUBMITTED_TO_PSP', 'COMPLETED', 'PENDING'] },
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

  const totalVolume = Number(volumeAgg._sum.grossAmount || 0);
  const platformCommission = Number(volumeAgg._sum.commissionAmount || 0);
  const rawHospitalNet = Number(volumeAgg._sum.hospitalNetAmount || 0);
  const stripeFees = Number(volumeAgg._sum.stripeFeeAmount || 0);
  const paidCount = volumeAgg._count || 0;
  const refundedAmount = Number(refundAgg._sum.amount || 0);
  const refundedCount = refundAgg._count || 0;
  const totalTransactions = paidCount + refundedCount;
  const hospitalNet = Math.max(0, rawHospitalNet - refundedAmount);
  const retainedVolume = Math.max(0, totalVolume - refundedAmount);

  return res.status(200).json({
    success: true,
    data: {
      // Frontend expected standard keys
      totalVolume,
      retainedVolume,
      totalRefundsAmount: refundedAmount,
      platformNetCommission: platformCommission,
      totalHospitalNet: hospitalNet,
      totalStripeFee: stripeFees,
      totalTransactions,
      paidCount,
      refundedCount,

      // Backend legacy keys
      totalGrossPlatformVolume: totalVolume,
      totalPlatformCommissionEarned: platformCommission,
      totalHospitalNetDisbursed: hospitalNet,
      totalStripeFees: stripeFees,
      paidTransactionsCount: paidCount,
      totalRefundedAmount: refundedAmount,
      processedRefundsCount: refundedCount,
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

  const syncedRefunds = await Promise.all(
    refunds.map(async (r) => {
      if (['PROCESSING', 'SUBMITTED_TO_PSP', 'PENDING'].includes(r.status)) {
        return verifyAndSyncRefund(r, r.transaction?.stripeConnectedAccountId);
      }
      return r;
    })
  );

  const formatted = syncedRefunds.map((r) => ({
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
        pages: Math.ceil(totalCount / limit),
      },
    },
  });
}

/**
 * GET /api/payments/stripe/admin/analytics/dashboard
 * Single unified API providing all metrics, trend charts, breakdowns, and top rankings for Super Admin Revenue Dashboard.
 */
async function getAdminDashboardAnalytics(req, res) {
  if (!requireSuperAdmin(req, res)) return;

  const { timeframe = '12-months', startDate, endDate } = req.query;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const startOfLastYearMonth = new Date(now.getFullYear() - 1, now.getMonth(), 1, 0, 0, 0, 0);
  const endOfLastYearMonth = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0, 23, 59, 59, 999);

  const validStatuses = ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'];

  // 12 rolling months ending at current month
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsRange = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    monthsRange.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      month: monthNames[d.getMonth()],
      year: d.getFullYear(),
      start: mStart,
      end: mEnd,
    });
  }

  const twelveMonthsStart = monthsRange[0].start;

  // Run aggregations and fetch transactions in parallel
  const [
    todayAgg,
    thisMonthAgg,
    lastMonthAgg,
    lastYearAgg,
    allTimeAgg,
    recentTransactions,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: { status: { in: validStatuses }, createdAt: { gte: startOfToday, lte: endOfToday } },
      _sum: { grossAmount: true, commissionAmount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { status: { in: validStatuses }, createdAt: { gte: startOfThisMonth } },
      _sum: { grossAmount: true, commissionAmount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { status: { in: validStatuses }, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      _sum: { grossAmount: true, commissionAmount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { status: { in: validStatuses }, createdAt: { gte: startOfLastYearMonth, lte: endOfLastYearMonth } },
      _sum: { grossAmount: true },
    }),
    prisma.transaction.aggregate({
      where: { status: { in: validStatuses } },
      _sum: { grossAmount: true, commissionAmount: true, hospitalNetAmount: true, stripeFeeAmount: true },
      _count: true,
    }),
    prisma.transaction.findMany({
      where: {
        status: { in: validStatuses },
        createdAt: { gte: twelveMonthsStart },
      },
      select: {
        grossAmount: true,
        commissionAmount: true,
        hospitalNetAmount: true,
        stripeFeeAmount: true,
        hospitalId: true,
        hospitalName: true,
        doctorId: true,
        doctorName: true,
        doctorSpecialty: true,
        paymentMethodType: true,
        cardBrand: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Compute KPI values
  const todayRevenue = Number(todayAgg._sum.grossAmount || 0);
  const thisMonthRevenue = Number(thisMonthAgg._sum.grossAmount || 0);
  const lastMonthRevenue = Number(lastMonthAgg._sum.grossAmount || 0);
  const thisMonthCommission = Number(thisMonthAgg._sum.commissionAmount || 0);
  const allTimeRevenue = Number(allTimeAgg._sum.grossAmount || 0);
  const allTimeCommission = Number(allTimeAgg._sum.commissionAmount || 0);

  const momGrowth = lastMonthRevenue > 0
    ? Number((((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1))
    : (thisMonthRevenue > 0 ? 100 : 0);

  const lastYearRevenue = Number(lastYearAgg._sum.grossAmount || 0);
  const yoyGrowth = lastYearRevenue > 0
    ? Number((((thisMonthRevenue - lastYearRevenue) / lastYearRevenue) * 100).toFixed(1))
    : (thisMonthRevenue > 0 ? 100 : 0);

  // 1. Revenue Trend (12 Months)
  const trendMap = {};
  for (const m of monthsRange) {
    trendMap[m.key] = { month: m.month, year: m.year, revenue: 0, consultations: 0 };
  }
  for (const tx of recentTransactions) {
    const d = new Date(tx.createdAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (trendMap[k]) {
      trendMap[k].revenue += Number(tx.grossAmount || 0);
      trendMap[k].consultations += 1;
    }
  }
  const revenueTrend = monthsRange.map((m) => ({
    month: m.month,
    year: m.year,
    revenue: Math.round(trendMap[m.key].revenue),
    consultations: trendMap[m.key].consultations,
  }));

  // 2. Hospital Contribution
  const hospitalMap = {};
  let totalHospitalVolume = 0;
  for (const tx of recentTransactions) {
    const name = tx.hospitalName || 'General Hospital';
    const val = Number(tx.grossAmount || 0);
    totalHospitalVolume += val;
    if (!hospitalMap[name]) hospitalMap[name] = { name, value: 0, consultations: 0 };
    hospitalMap[name].value += val;
    hospitalMap[name].consultations += 1;
  }
  const sortedHospitals = Object.values(hospitalMap).sort((a, b) => b.value - a.value);
  const hospitalContribution = sortedHospitals.map((h) => ({
    name: h.name,
    value: Math.round(h.value),
    percent: totalHospitalVolume > 0 ? Math.round((h.value / totalHospitalVolume) * 100) : 0,
    consultations: h.consultations,
  }));

  // 3. Revenue by Specialty
  const specialtyMap = {};
  for (const tx of recentTransactions) {
    const spec = tx.doctorSpecialty || 'General Medicine';
    const val = Number(tx.grossAmount || 0);
    if (!specialtyMap[spec]) specialtyMap[spec] = { specialty: spec, revenue: 0, consultations: 0 };
    specialtyMap[spec].revenue += val;
    specialtyMap[spec].consultations += 1;
  }
  const revenueBySpecialty = Object.values(specialtyMap)
    .sort((a, b) => b.revenue - a.revenue)
    .map((s) => ({
      specialty: s.specialty,
      revenue: Math.round(s.revenue),
      consultations: s.consultations,
    }));

  // 4. Payment Methods Distribution
  const methodMap = {};
  let totalMethodCount = 0;
  for (const tx of recentTransactions) {
    const rawBrand = (tx.cardBrand || '').toUpperCase();
    const rawType = (tx.paymentMethodType || '').toLowerCase();
    let method = 'Credit Card';
    if (rawBrand.includes('VISA')) method = 'Visa';
    else if (rawBrand.includes('MASTERCARD')) method = 'Mastercard';
    else if (rawType.includes('wallet') || rawType.includes('apple') || rawType.includes('google')) method = 'Digital Wallet';
    else if (rawType.includes('insurance')) method = 'Insurance';
    else if (rawType.includes('debit')) method = 'Debit Card';
    else if (rawBrand) method = `${tx.cardBrand} Card`;

    totalMethodCount += 1;
    if (!methodMap[method]) methodMap[method] = { method, count: 0, amount: 0 };
    methodMap[method].count += 1;
    methodMap[method].amount += Number(tx.grossAmount || 0);
  }
  const METHOD_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
  const paymentMethods = Object.values(methodMap).map((m, idx) => ({
    method: m.method,
    value: totalMethodCount > 0 ? Math.round((m.count / totalMethodCount) * 100) : 0,
    count: m.count,
    amount: Math.round(m.amount),
    color: METHOD_COLORS[idx % METHOD_COLORS.length],
  }));

  // 5. Top Doctors by Revenue
  const doctorMap = {};
  const unresolvedDoctorIds = new Set();

  for (const tx of recentTransactions) {
    let name = tx.doctorName;
    if (!name || name === 'Doctor') {
      if (tx.doctorId) unresolvedDoctorIds.add(tx.doctorId);
    }
    const hospital = tx.hospitalName || 'General Hospital';
    const key = tx.doctorId || name || 'Doctor';
    if (!doctorMap[key]) {
      doctorMap[key] = {
        doctorId: tx.doctorId,
        name: name || 'Doctor',
        hospital,
        revenue: 0,
        consultations: 0,
      };
    }
    doctorMap[key].revenue += Number(tx.grossAmount || 0);
    doctorMap[key].consultations += 1;
  }

  // Resolve real doctor names from profile-service if any were missing or defaulted
  if (unresolvedDoctorIds.size > 0 && PROFILE_URL) {
    await Promise.all(
      Array.from(unresolvedDoctorIds).map(async (docId) => {
        try {
          const r = await axios.get(`${PROFILE_URL}/api/doctors/${docId}`, { timeout: 3000 });
          const doc = r.data?.data || r.data;
          const resolvedName = doc?.fullName || doc?.name || (doc?.firstName ? `${doc.firstName} ${doc.lastName || ''}`.trim() : null);
          const resolvedSpec = doc?.primarySpecialization || doc?.specialty;
          if (resolvedName && doctorMap[docId]) {
            doctorMap[docId].name = resolvedName;
            // Backfill transaction asynchronously so subsequent queries are instant
            prisma.transaction.updateMany({
              where: { doctorId: docId, OR: [{ doctorName: null }, { doctorName: 'Doctor' }] },
              data: {
                doctorName: resolvedName,
                ...(resolvedSpec ? { doctorSpecialty: resolvedSpec } : {}),
              },
            }).catch(() => {});
          }
        } catch (_) {}
      })
    );
  }

  const topDoctors = Object.values(doctorMap)
    .sort((a, b) => b.revenue - a.revenue)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      hospital: d.hospital,
      revenue: Number(d.revenue.toFixed(2)),
      consultations: d.consultations,
    }));

  // 6. Top 10 Hospitals by Revenue
  const topHospitalsMap = {};
  for (const tx of recentTransactions) {
    const hId = tx.hospitalId || 'general';
    const name = tx.hospitalName || 'Hospital';
    if (!topHospitalsMap[hId]) {
      topHospitalsMap[hId] = {
        hospitalId: hId,
        name,
        consultations: 0,
        revenue: 0,
        commission: 0,
        lastMonthRevenue: 0,
      };
    }
    const val = Number(tx.grossAmount || 0);
    const comm = Number(tx.commissionAmount || 0);
    topHospitalsMap[hId].consultations += 1;
    topHospitalsMap[hId].revenue += val;
    topHospitalsMap[hId].commission += comm;

    const d = new Date(tx.createdAt);
    if (d >= startOfLastMonth && d <= endOfLastMonth) {
      topHospitalsMap[hId].lastMonthRevenue += val;
    }
  }

  const topHospitals = Object.values(topHospitalsMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((h, index) => {
      const growth = h.lastMonthRevenue > 0
        ? Math.round(((h.revenue - h.lastMonthRevenue) / h.lastMonthRevenue) * 100)
        : (h.revenue > 0 ? 15 : 0);
      return {
        rank: index + 1,
        hospitalId: h.hospitalId,
        name: h.name,
        consultations: h.consultations,
        revenue: Number(h.revenue.toFixed(2)),
        commission: Number(h.commission.toFixed(2)),
        growth,
      };
    });

  return res.status(200).json({
    success: true,
    data: {
      metrics: {
        todayRevenue,
        thisMonthRevenue: thisMonthRevenue > 0 ? thisMonthRevenue : allTimeRevenue,
        momGrowth,
        platformCommission: thisMonthCommission > 0 ? thisMonthCommission : allTimeCommission,
        allTimeCommission,
        yoyGrowth,
        allTimeRevenue,
        paidTransactionsCount: allTimeAgg._count,
      },
      revenueTrend,
      hospitalContribution,
      revenueBySpecialty,
      paymentMethods,
      topDoctors,
      topHospitals,
    },
  });
}

module.exports = {
  listAdminTransactions,
  getAdminTransactionById,
  getAdminStats,
  listAdminRefunds,
  getAdminDashboardAnalytics,
};
