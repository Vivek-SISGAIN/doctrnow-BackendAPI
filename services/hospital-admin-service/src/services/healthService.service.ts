import { ServiceType, ServiceStatus } from '@prisma/client';
import prisma from '../prisma/prisma';

export class HealthServiceService {
  async createService(data: {
    name: string;
    type: ServiceType;
    originalPrice: number;
    finalPrice: number;
    hospitalId: string;
    status?: ServiceStatus;
  }) {
    return await prisma.healthService.create({
      data: {
        name: data.name,
        type: data.type,
        originalPrice: data.originalPrice,
        finalPrice: data.finalPrice,
        hospitalId : data.hospitalId,
        status: data.status || ServiceStatus.ACTIVE
      }
    });
  }

  async getAllServices(filters?: { type?: ServiceType; status?: ServiceStatus }) {
    return await prisma.healthService.findMany({
      where: {
        ...(filters?.type && { type: filters.type }),
        ...(filters?.status && { status: filters.status })
      },
      include: {
        packages: {
          include: {
            package: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async getAllServicesPaged(
    filters: {
      type?: ServiceType;
      status?: ServiceStatus;
      hospitalId?: string;
      search?: string;
    } = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 20 }
  ) {
    const page = Number.isFinite(pagination.page) ? pagination.page : 1;
    const limit = Number.isFinite(pagination.limit) ? pagination.limit : 20;
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

    const where: any = {
      ...(filters.type && { type: filters.type }),
      ...(filters.status && { status: filters.status }),
      ...(filters.hospitalId && { hospitalId: filters.hospitalId })
    };

    if (filters.search?.trim()) {
      where.name = { contains: filters.search.trim(), mode: 'insensitive' };
    }

    const [services, total] = await Promise.all([
      prisma.healthService.findMany({
        where,
        include: {
          packages: {
            include: {
              package: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Math.max(1, limit)
      }),
      prisma.healthService.count({ where })
    ]);

    return {
      services,
      pagination: {
        page: Math.max(1, page),
        limit: Math.max(1, limit),
        total,
        totalPages: Math.ceil(total / Math.max(1, limit))
      }
    };
  }

  async getServiceById(id: string) {
    return await prisma.healthService.findUnique({
      where: { id },
      include: {
        packages: {
          include: {
            package: true
          }
        }
      }
    });
  }

  async updateService(
    id: string,
    data: {
      name?: string;
      type?: ServiceType;
      originalPrice?: number;
      finalPrice?: number;
      status?: ServiceStatus;
    }
  ) {
    return await prisma.healthService.update({
      where: { id },
      data
    });
  }

  async deleteService(id: string) {
    return await prisma.healthService.delete({
      where: { id }
    });
  }

  async getServicesByType(type: ServiceType) {
    return await prisma.healthService.findMany({
      where: { type, status: ServiceStatus.ACTIVE }
    });
  }
}

export default new HealthServiceService();
