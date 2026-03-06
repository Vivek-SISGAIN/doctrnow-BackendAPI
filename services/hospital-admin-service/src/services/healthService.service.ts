import { ServiceType, ServiceStatus } from '@prisma/client';
import prisma from '../prisma/prisma';

export class HealthServiceService {
  async createService(data: {
    name: string;
    type: ServiceType;
    originalPrice: number;
    finalPrice: number;
    status?: ServiceStatus;
  }) {
    return await prisma.healthService.create({
      data: {
        name: data.name,
        type: data.type,
        originalPrice: data.originalPrice,
        finalPrice: data.finalPrice,
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
