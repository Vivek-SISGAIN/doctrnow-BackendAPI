import prisma from '../prisma/prisma';
import axios from 'axios';

export class HealthPackageService {
  async createPackage(data: any) {
    const { serviceIds, ...packageData } = data;

    const healthPackage = await (prisma.healthPackage as any).create({
      data: {
        ...packageData,
        ...(serviceIds && serviceIds.length > 0 && {
          services: {
            create: serviceIds.map((serviceId: string) => ({
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

    return this._attachHospitalDetails(healthPackage);
  }

  async getAllPackages() {
    const packages = await prisma.healthPackage.findMany({
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

    return this._attachHospitalDetails(packages);
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

    const enrichedPackages = await this._attachHospitalDetails(packages);

    return {
      packages: enrichedPackages,
      pagination: {
        page: Math.max(1, page),
        limit: Math.max(1, limit),
        total,
        totalPages: Math.ceil(total / Math.max(1, limit))
      }
    };
  }

  async getPackageById(id: string) {
    const healthPackage = await prisma.healthPackage.findUnique({
      where: { id },
      include: {
        services: {
          include: {
            service: true
          }
        }
      }
    });

    if (!healthPackage) return null;

    return this._attachHospitalDetails(healthPackage);
  }

  async updatePackage(id: string, data: any) {
    const healthPackage = await (prisma.healthPackage as any).update({
      where: { id },
      data
    });

    return this._attachHospitalDetails(healthPackage);
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

  async _attachHospitalDetails(data: any) {
    if (!data) return data;
    const isArray = Array.isArray(data);
    const packages = isArray ? data : [data];

    // Collect unique hospital IDs
    const hospitalIds = Array.from(new Set(packages.map((p: any) => p.hospitalId).filter(Boolean)));
    if (hospitalIds.length === 0) return data;

    // Robust URL parsing to handle malformed .env strings like ""http://localhost:8080/"
    let baseUrl = process.env.API_BASE_URL || 'http://localhost:8080';
    
    // 1. Remove all quotes
    baseUrl = baseUrl.replace(/["']/g, '');
    
    // 2. Remove trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '');
    
    // 3. Ensure it ends with /api/v1 if we're calling gateway routes
    if (!baseUrl.endsWith('/api/v1')) {
      baseUrl += '/api/v1';
    }

    const internalSecret = process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123';

    try {
      const response = await axios.post(
        `${baseUrl}/super-admins/hospital/bulk`,
        { ids: hospitalIds },
        {
          headers: {
            'x-internal-service-key': internalSecret,
            'x-internal-secret': internalSecret,
            'Content-Type': 'application/json'
          }
        }
      );

      const hospitalMap = response.data?.data || {};

      packages.forEach((pkg: any) => {
        if (pkg.hospitalId && hospitalMap[pkg.hospitalId]) {
          pkg.hospital = {
            id: pkg.hospitalId,
            officialName: hospitalMap[pkg.hospitalId].officialName,
            shortName: hospitalMap[pkg.hospitalId].shortName,
            fullAddress: hospitalMap[pkg.hospitalId].fullAddress,
            area: hospitalMap[pkg.hospitalId].area,
            emirate: hospitalMap[pkg.hospitalId].emirate
          };
        }
      });
    } catch (error: any) {
      console.error('[HealthPackageService] Failed to fetch hospital details:', error.message);
    }

    return isArray ? packages : packages[0];
  }
}

export default new HealthPackageService();
