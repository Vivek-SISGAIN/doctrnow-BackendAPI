import prisma from "../prisma/client.js";

class BannerService {

  // ✅ Create Banner
  async createBanner(data) {
    const banner = await prisma.banners.create({
      data: {
        icon: data.icon,
        serviceDesc: data.serviceDesc,
        title: data.title,
        description: data.description,
        hospitalId : data.hospitalId,
        portal: data.portal, // ✅ REQUIRED NOW
      },
    });

    return banner;
  }

  // ✅ Get Banner by ID
  async getBannerById(id) {
    const banner = await prisma.banners.findUnique({
      where: { id },
    });

    if (!banner) {
      throw new Error("Banner not found");
    }

    return banner;
  }

  // ✅ Update Banner (Partial Update ✅)
  async updateBanner(id, data) {
    const banner = await prisma.banners.update({
      where: { id },
      data: {
        ...(data.icon && { icon: data.icon }),
        ...(data.serviceDesc && { serviceDesc: data.serviceDesc }),
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.portal && { portal: data.portal }),
      },
    });

    return banner;
  }

  // ✅ Delete Banner
  async deleteBanner(id) {
    await prisma.banners.delete({
      where: { id },
    });

    return { message: "Banner deleted successfully" };
  }

  // ✅ Get All Banners (with search + portal filter)
  async getBanners(filters = {}, pagination = {}) {
    const { search, portal } = filters;
    const { page = 1, limit = 20 } = pagination;

    const skip = (page - 1) * limit;
    const where = {};

    // ✅ Search filter
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { serviceDesc: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // ✅ Portal filter
    if (portal) {
      where.portal = portal;
    }

    const [banners, total] = await Promise.all([
      prisma.banners.findMany({
        where,
        orderBy: { createdAt: "desc" }, // ✅ better sorting
        skip,
        take: parseInt(limit, 10),
      }),
      prisma.banners.count({ where }),
    ]);

    return {
      data : banners,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export default new BannerService();