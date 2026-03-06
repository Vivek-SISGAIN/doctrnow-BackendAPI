const prisma = require('../prisma/prisma');

class InsuranceProviderService {
  /**
   * Find provider by unique-ish fields
   * (email / phone / providerName)
   */
  findByUniqueFields({ providerName, contactEmail, contactPhone }) {
    return prisma.insuranceProvider.findFirst({
      where: {
        OR: [
          providerName && { providerName },
          contactEmail && { contactEmail },
          contactPhone && { contactPhone }
        ].filter(Boolean)
      }
    });
  }

  /**
   * Create Insurance Provider
   */
  async create(data) {
    // 1️⃣ Check for duplicates
    const existingProvider = await this.findByUniqueFields({
      providerName: data.providerName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone
    });

    if (existingProvider) {
      throw new Error('Insurance Provider already exists with given name / email / phone');
    }

    // 2️⃣ Create provider
    return prisma.insuranceProvider.create({
      data: {
        providerName: data.providerName,
        providerType: data.providerType,

        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        website: data.website || null,

        networkType: data.networkType,
        claimSubmissionMethod: data.claimSubmissionMethod,

        avgProcessingDays: data.avgProcessingDays || null,
        address: data.address,

        supportedServices: data.supportedServices || [],
        note: data.note || null
      }
    });
  }

  /**
   * Build where clause for filtering & search
   */
  buildWhereClause({ search, providerType, networkType, supportedService }) {
    const where = {};

    if (search) {
      where.OR = [
        { providerName: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (providerType) {
      where.providerType = providerType;
    }

    if (networkType) {
      where.networkType = networkType;
    }

    if (supportedService) {
      where.supportedServices = { has: supportedService };
    }

    return where;
  }

  /**
   * Find provider by ID
   */
  findById(id) {
    return prisma.insuranceProvider.findUnique({
      where: { id }
    });
  }

  /**
   * Find all providers
   */
  findAll(filters = {}) {
    return prisma.insuranceProvider.findMany({
      where: this.buildWhereClause(filters),
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Check conflicts while updating
   */
  findConflictingProvider(id, { providerName, contactEmail, contactPhone }) {
    if (!providerName && !contactEmail && !contactPhone) {
      return null;
    }

    return prisma.insuranceProvider.findFirst({
      where: {
        AND: [
          { id: { not: id } },
          {
            OR: [
              providerName && { providerName },
              contactEmail && { contactEmail },
              contactPhone && { contactPhone }
            ].filter(Boolean)
          }
        ]
      }
    });
  }

  /**
   * Update provider
   */
  async update(id, data) {
    const conflict = await this.findConflictingProvider(id, {
      providerName: data.providerName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone
    });

    if (conflict) {
      throw new Error('Another Insurance Provider already exists with given name / email / phone');
    }

    return prisma.insuranceProvider.update({
      where: { id },
      data
    });
  }

  /**
   * Delete provider
   */
  delete(id) {
    return prisma.insuranceProvider.delete({
      where: { id }
    });
  }
}

module.exports = new InsuranceProviderService();
