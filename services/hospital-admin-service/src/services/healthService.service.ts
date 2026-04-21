import { ServiceType, ServiceStatus } from '@prisma/client';
import prisma from '../prisma/prisma';
import axios from 'axios';

export class HealthServiceService {
  private getApiBaseUrl() {
    return process.env.API_BASE_URL || 'http://localhost:8080/';
  }

  private buildForwardHeaders(context?: {
    authorization?: string;
    tenantId?: string;
    actorUserId?: string;
  }) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (context?.authorization) headers.Authorization = context.authorization;
    if (context?.tenantId) headers['X-Tenant-ID'] = context.tenantId;
    if (context?.actorUserId) headers['X-User-ID'] = context.actorUserId;

    return headers;
  }

  private async notifyHospitalAdminsOnServiceCreate(
    service: {
      id: string;
      name: string;
      type: ServiceType;
      originalPrice: any;
      finalPrice: any;
      hospitalId: string;
      status: ServiceStatus;
      createdAt: Date;
    },
    context?: {
      authorization?: string;
      tenantId?: string;
      actorUserId?: string;
    },
  ) {
    const baseUrl = this.getApiBaseUrl();
    const headers = this.buildForwardHeaders(context);

    try {
      const hospitalAdminsResponse = await axios.get(
        `${baseUrl}api/v1/profiles/hospital-admins/hospital/id/${service.hospitalId}`,
        { headers },
      );

      const hospitalAdmins = hospitalAdminsResponse?.data?.data ?? [];
      const targetUserIds = [...new Set(hospitalAdmins
        .map((admin: { userId?: string }) => admin?.userId)
        .filter(Boolean))];

      if (!targetUserIds.length) {
        return;
      }

      await axios.post(
        `${baseUrl}api/v1/notifications/bulk`,
        {
          userIds: targetUserIds,
          channels: ['IN_APP'],
          title: 'New Health Service Created',
          body: `${service.name} has been added for your hospital.`,
          payload: {
            type: 'HEALTH_SERVICE_CREATED',
            hospitalId: service.hospitalId,
            healthService: {
              id: service.id,
              name: service.name,
              type: service.type,
              originalPrice: service.originalPrice,
              finalPrice: service.finalPrice,
              status: service.status,
              createdAt: service.createdAt,
            },
          },
        },
        { headers },
      );
    } catch (error) {
      console.error('[HealthServiceService] Failed to send hospital-admin notifications:', error);
    }
  }

  async createService(data: {
    name: string;
    type: ServiceType;
    originalPrice: number;
    userId: string;
    finalPrice: number;
    hospitalId: string;
    status?: ServiceStatus;
  }, context?: {
    authorization?: string;
    tenantId?: string;
    actorUserId?: string;
  }) {
    const service = await prisma.healthService.create({
      data: {
        name: data.name,
        type: data.type,
        originalPrice: data.originalPrice,
        finalPrice: data.finalPrice,
        hospitalId: data.hospitalId,
        status: data.status || ServiceStatus.ACTIVE,
      },
    });

    await this.notifyHospitalAdminsOnServiceCreate(service, context);

    return service;
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
      originalPrice?: any;
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
