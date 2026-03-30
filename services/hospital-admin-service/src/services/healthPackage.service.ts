import prisma from '../prisma/prisma';

export class HealthPackageService {
  async createPackage(data: {
    name: string;
    description: string;
    originalPrice: number;
    finalPrice: number;
    discountPct: number;
    hospitalId: string;
    validityDays: number;
    serviceIds?: string[];
  }) {
    const { serviceIds, ...packageData } = data;

    return await prisma.healthPackage.create({
      data: {
        ...packageData,
        ...(serviceIds && serviceIds.length > 0 && {
          services: {
            create: serviceIds.map((serviceId) => ({
              serviceId
            }))
          }
        })
      },
      include: {
        services: {
          include: {
            service: true
          }
        }
      }
    });
  }

  async getAllPackages() {
    return await prisma.healthPackage.findMany({
      include: {
        services: {
          include: {
            service: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async getAllPackagesPaged(
    filters: { hospitalId?: string; search?: string } = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 20 }
  ) {
    const page = Number.isFinite(pagination.page) ? pagination.page : 1;
    const limit = Number.isFinite(pagination.limit) ? pagination.limit : 20;
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

    const where: any = {
      ...(filters.hospitalId && { hospitalId: filters.hospitalId })
    };

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } }
      ];
    }

    const [packages, total] = await Promise.all([
      prisma.healthPackage.findMany({
        where,
        include: {
          services: {
            include: {
              service: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Math.max(1, limit)
      }),
      prisma.healthPackage.count({ where })
    ]);

    return {
      packages,
      pagination: {
        page: Math.max(1, page),
        limit: Math.max(1, limit),
        total,
        totalPages: Math.ceil(total / Math.max(1, limit))
      }
    };
  }

  async getPackageById(id: string) {
    return await prisma.healthPackage.findUnique({
      where: { id },
      include: {
        services: {
          include: {
            service: true
          }
        }
      }
    });
  }

  async updatePackage(id: string, data: {
    name?: string;
    description?: string;
    originalPrice?: number;
    finalPrice?: number;
    discountPct?: number;
    validityDays?: number;
  }) {
    return await prisma.healthPackage.update({
      where: { id },
      data
    });
  }

  async deletePackage(id: string) {
    return await prisma.healthPackage.delete({
      where: { id }
    });
  }

  async addServiceToPackage(packageId: string, serviceId: string) {
    return await prisma.packageService.create({
      data: {
        packageId,
        serviceId
      }
    });
  }

  async removeServiceFromPackage(packageId: string, serviceId: string) {
    return await prisma.packageService.delete({
      where: {
        packageId_serviceId: {
          packageId,
          serviceId
        }
      }
    });
  }

  async getPackageServices(packageId: string) {
    return await prisma.packageService.findMany({
      where: { packageId },
      include: {
        service: true
      }
    });
  }
}

export default new HealthPackageService();
