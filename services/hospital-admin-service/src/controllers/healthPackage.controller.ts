import { Request, Response } from 'express';
import healthPackageService from '../services/healthPackage.service';
import healthServiceService from '../services/healthService.service';

export class HealthPackageController {
  
  async createPackage(req: Request, res: Response) {
    const { 
      name, description, hospitalId, originalPrice, finalPrice, 
      discountPct, validityDays, image, rating, reviews, 
      duration, popular, serviceIds 
    } = req.body;

    // Validate required fields
    if (!name || !description || !originalPrice || !finalPrice || discountPct === undefined || !validityDays) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, description, originalPrice, finalPrice, discountPct, validityDays'
      });
    }

    // Validate prices
    if (originalPrice < 0 || finalPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Prices must be positive numbers'
      });
    }

    // Validate discount percentage
    if (discountPct < 0 || discountPct > 100) {
      return res.status(400).json({
        success: false,
        message: 'Discount percentage must be between 0 and 100'
      });
    }

    // Validate validity days
    if (validityDays < 1) {
      return res.status(400).json({
        success: false,
        message: 'Validity days must be at least 1'
      });
    }

    // Validate service IDs if provided
    if (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) {
      for (const serviceId of serviceIds) {
        const service = await (healthServiceService as any).getServiceById(serviceId);
        if (!service) {
          return res.status(404).json({
            success: false,
            message: `Service with ID ${serviceId} not found`
          });
        }
      }
    }

    const healthPackage = await healthPackageService.createPackage({
      name,
      description,
      hospitalId,
      originalPrice: parseFloat(originalPrice),
      finalPrice: parseFloat(finalPrice),
      discountPct: parseInt(discountPct),
      validityDays: parseInt(validityDays),
      image,
      rating: rating ? parseFloat(rating) : undefined,
      reviews: reviews ? parseInt(reviews) : undefined,
      duration,
      popular: popular === true || popular === 'true',
      serviceIds
    } as any);

    return res.status(201).json({
      success: true,
      message: 'Health package created successfully',
      data: healthPackage
    });
  }

  /**
   * Get all health packages
   * GET /api/health-packages?page=1&limit=20&search=...&hospitalId=...
   */
  async getAllPackages(req: Request, res: Response) {
    const { page = '1', limit = '20', search, hospitalId } = req.query;

    const filters: { hospitalId?: string; search?: string } = {};
    if (hospitalId && typeof hospitalId === 'string') filters.hospitalId = hospitalId;
    if (search && typeof search === 'string') filters.search = search;

    const pagination = {
      page: parseInt(String(page), 10) || 1,
      limit: parseInt(String(limit), 10) || 20
    };

    const result = await healthPackageService.getAllPackagesPaged(filters, pagination);

    return res.status(200).json({
      success: true,
      message: 'Health packages retrieved successfully',
      data: result.packages,
      count: result.pagination.total,
      pagination: result.pagination
    });
  }

  /**
   * Get a single health package by ID
   * GET /api/health-packages/:id
   */
  async getPackageById(req: Request, res: Response) {
    const { id } = req.params;

    const healthPackage = await healthPackageService.getPackageById(id);

    if (!healthPackage) {
      return res.status(404).json({
        success: false,
        message: 'Health package not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Health package retrieved successfully',
      data: healthPackage
    });
  }

  /**
   * Update a health package
   * PATCH /api/health-packages/:id
   */
  async updatePackage(req: Request, res: Response) {
    const { id } = req.params;
    const { 
      name, description, originalPrice, finalPrice, 
      discountPct, validityDays, image, rating, 
      reviews, duration, popular 
    } = req.body;

    // Check if package exists
    const existingPackage = await healthPackageService.getPackageById(id);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Health package not found'
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

    // Validate discount percentage if provided
    if (discountPct !== undefined && (discountPct < 0 || discountPct > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Discount percentage must be between 0 and 100'
      });
    }

    // Validate validity days if provided
    if (validityDays !== undefined && validityDays < 1) {
      return res.status(400).json({
        success: false,
        message: 'Validity days must be at least 1'
      });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (originalPrice !== undefined) updateData.originalPrice = parseFloat(originalPrice);
    if (finalPrice !== undefined) updateData.finalPrice = parseFloat(finalPrice);
    if (discountPct !== undefined) updateData.discountPct = parseInt(discountPct);
    if (validityDays !== undefined) updateData.validityDays = parseInt(validityDays);
    if (image !== undefined) updateData.image = image;
    if (rating !== undefined) updateData.rating = parseFloat(rating);
    if (reviews !== undefined) updateData.reviews = parseInt(reviews);
    if (duration !== undefined) updateData.duration = duration;
    if (popular !== undefined) updateData.popular = popular === true || popular === 'true';

    const healthPackage = await healthPackageService.updatePackage(id, updateData);

    return res.status(200).json({
      success: true,
      message: 'Health package updated successfully',
      data: healthPackage
    });
  }

  /**
   * Delete a health package
   * DELETE /api/health-packages/:id
   */
  async deletePackage(req: Request, res: Response) {
    const { id } = req.params;

    // Check if package exists
    const existingPackage = await healthPackageService.getPackageById(id);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Health package not found'
      });
    }

    await healthPackageService.deletePackage(id);

    return res.status(200).json({
      success: true,
      message: 'Health package deleted successfully'
    });
  }

  /**
   * Add a service to a package
   * POST /api/health-packages/services
   * Body: { packageId, serviceId }
   */
  async addServiceToPackage(req: Request, res: Response) {
    const { packageId, serviceId } = req.body;

    // Validate required fields
    if (!packageId || !serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: packageId, serviceId'
      });
    }

    // Check if package exists
    const existingPackage = await healthPackageService.getPackageById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Health package not found'
      });
    }

    // Check if service exists
    const existingService = await (healthServiceService as any).getServiceById(serviceId);
    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: 'Health service not found'
      });
    }

    // Check if service is already in package
    const existingServices = await healthPackageService.getPackageServices(packageId);
    const isServiceInPackage = existingServices.some((ps: any) => ps.serviceId === serviceId);

    if (isServiceInPackage) {
      return res.status(400).json({
        success: false,
        message: 'Service is already added to this package'
      });
    }

    const packageService = await healthPackageService.addServiceToPackage(packageId, serviceId);

    return res.status(201).json({
      success: true,
      message: 'Service added to package successfully',
      data: packageService
    });
  }

  /**
   * Remove a service from a package
   * DELETE /api/health-packages/:packageId/services/:serviceId
   */
  async removeServiceFromPackage(req: Request, res: Response) {
    const { packageId, serviceId } = req.params;

    // Check if package exists
    const existingPackage = await healthPackageService.getPackageById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Health package not found'
      });
    }

    // Check if service exists in package
    const existingServices = await healthPackageService.getPackageServices(packageId);
    const isServiceInPackage = existingServices.some((ps: any) => ps.serviceId === serviceId);

    if (!isServiceInPackage) {
      return res.status(404).json({
        success: false,
        message: 'Service not found in this package'
      });
    }

    await healthPackageService.removeServiceFromPackage(packageId, serviceId);

    return res.status(200).json({
      success: true,
      message: 'Service removed from package successfully'
    });
  }

  /**
   * Get all services in a package
   * GET /api/health-packages/:packageId/services
   */
  async getPackageServices(req: Request, res: Response) {
    const { packageId } = req.params;

    // Check if package exists
    const existingPackage = await healthPackageService.getPackageById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Health package not found'
      });
    }

    const services = await healthPackageService.getPackageServices(packageId);

    return res.status(200).json({
      success: true,
      message: 'Package services retrieved successfully',
      data: services,
      count: services.length
    });
  }
}

export default new HealthPackageController();
