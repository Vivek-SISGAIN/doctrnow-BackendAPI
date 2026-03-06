import { Request, Response } from 'express';
import healthServiceService from '../services/healthService.service';
import { ServiceType, ServiceStatus } from '@prisma/client';

export class HealthServiceController {
  /**
   * Create a new health service
   * POST /api/health-services
   */
  async createService(req: Request, res: Response) {
    const { name, type, originalPrice, finalPrice, status } = req.body;

    // Validate required fields
    if (!name || !type || !originalPrice || !finalPrice) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, type, originalPrice, finalPrice'
      });
    }

    // Validate service type
    if (!Object.values(ServiceType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid service type. Must be one of: ${Object.values(ServiceType).join(', ')}`
      });
    }

    // Validate prices
    if (originalPrice < 0 || finalPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Prices must be positive numbers'
      });
    }

    const service = await healthServiceService.createService({
      name,
      type,
      originalPrice: parseFloat(originalPrice),
      finalPrice: parseFloat(finalPrice),
      status: status || ServiceStatus.ACTIVE
    });

    return res.status(201).json({
      success: true,
      message: 'Health service created successfully',
      data: service
    });
  }

  /**
   * Get all health services with optional filters
   * GET /api/health-services?type=LAB_TEST&status=ACTIVE
   */
  async getAllServices(req: Request, res: Response) {
    const { type, status } = req.query;

    const filters: {
      type?: ServiceType;
      status?: ServiceStatus;
    } = {};

    if (type && Object.values(ServiceType).includes(type as ServiceType)) {
      filters.type = type as ServiceType;
    }

    if (status && Object.values(ServiceStatus).includes(status as ServiceStatus)) {
      filters.status = status as ServiceStatus;
    }

    const services = await healthServiceService.getAllServices(filters);

    return res.status(200).json({
      success: true,
      message: 'Health services retrieved successfully',
      data: services,
      count: services.length
    });
  }

  /**
   * Get services by type
   * GET /api/health-services/type/:type
   */
  async getServicesByType(req: Request, res: Response) {
    const { type } = req.params;

    if (!Object.values(ServiceType).includes(type as ServiceType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid service type. Must be one of: ${Object.values(ServiceType).join(', ')}`
      });
    }

    const services = await healthServiceService.getServicesByType(type as ServiceType);

    return res.status(200).json({
      success: true,
      message: 'Services retrieved successfully',
      data: services,
      count: services.length
    });
  }

  /**
   * Get a single health service by ID
   * GET /api/health-services/:id
   */
  async getServiceById(req: Request, res: Response) {
    const { id } = req.params;

    const service = await healthServiceService.getServiceById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Health service not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Health service retrieved successfully',
      data: service
    });
  }

  /**
   * Update a health service
   * PATCH /api/health-services/:id
   */
  async updateService(req: Request, res: Response) {
    const { id } = req.params;
    const { name, type, originalPrice, finalPrice, status } = req.body;

    // Check if service exists
    const existingService = await healthServiceService.getServiceById(id);
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: 'Health service not found'
      });
    }

    // Validate type if provided
    if (type && !Object.values(ServiceType).includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid service type. Must be one of: ${Object.values(ServiceType).join(', ')}`
      });
    }

    // Validate status if provided
    if (status && !Object.values(ServiceStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Object.values(ServiceStatus).join(', ')}`
      });
    }

    // Validate prices if provided
    if (originalPrice !== undefined && originalPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Original price must be a positive number'
      });
    }

    if (finalPrice !== undefined && finalPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Final price must be a positive number'
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (originalPrice !== undefined) updateData.originalPrice = parseFloat(originalPrice);
    if (finalPrice !== undefined) updateData.finalPrice = parseFloat(finalPrice);
    if (status !== undefined) updateData.status = status;

    const service = await healthServiceService.updateService(id, updateData);

    return res.status(200).json({
      success: true,
      message: 'Health service updated successfully',
      data: service
    });
  }

  /**
   * Delete a health service
   * DELETE /api/health-services/:id
   */
  async deleteService(req: Request, res: Response) {
    const { id } = req.params;

    // Check if service exists
    const existingService = await healthServiceService.getServiceById(id);
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: 'Health service not found'
      });
    }

    await healthServiceService.deleteService(id);

    return res.status(200).json({
      success: true,
      message: 'Health service deleted successfully'
    });
  }
}

export default new HealthServiceController();
