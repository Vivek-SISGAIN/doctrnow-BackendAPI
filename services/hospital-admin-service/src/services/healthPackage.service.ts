import prisma from '../prisma/prisma';

export class HealthPackageService {
  async createPackage(data: {
    name: string;
    description: string;
    originalPrice: number;
    finalPrice: number;
    discountPct: number;
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
