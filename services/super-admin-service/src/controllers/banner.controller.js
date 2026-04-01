import bannerService from "../services/banners.service.js"

class BannerController {

  // ✅ Create Banner
  async createBanner(req, res) {
    try {
      const { portal } = req.body;

      // Optional validation
      const validPortals = ["PATIENT", "DOCTOR", "GENERAL"];
      if (!validPortals.includes(portal)) {
        return res.status(400).json({
          success: false,
          message: "Invalid portal value",
        });
      }

      const banner = await bannerService.createBanner(req.body);

      return res.status(201).json({
        success: true,
        message: "Banner created successfully",
        data: banner,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create banner",
      });
    }
  }

  // ✅ Get Banner by ID
  async getBannerById(req, res) {
    try {
      const { id } = req.params;

      const banner = await bannerService.getBannerById(id);

      return res.status(200).json({
        success: true,
        data: banner,
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || "Banner not found",
      });
    }
  }

  // ✅ Update Banner
  async updateBanner(req, res) {
    try {
      const { id } = req.params;
      const { portal } = req.body;

      // Optional validation
      if (portal) {
        const validPortals = ["PATIENT", "DOCTOR", "GENERAL"];
        if (!validPortals.includes(portal)) {
          return res.status(400).json({
            success: false,
            message: "Invalid portal value",
          });
        }
      }

      const banner = await bannerService.updateBanner(id, req.body);

      return res.status(200).json({
        success: true,
        message: "Banner updated successfully",
        data: banner,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update banner",
      });
    }
  }

  // ✅ Delete Banner
  async deleteBanner(req, res) {
    try {
      const { id } = req.params;

      const result = await bannerService.deleteBanner(id);

      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to delete banner",
      });
    }
  }

  // ✅ Get All Banners (search + portal + pagination)
  async getBanners(req, res) {
    console.log("Fetching banners...");
    try {
      const { search, portal, page, limit } = req.query;
    console.log("Fetching banners..." , { search, portal, page, limit });

      const result = await bannerService.getBanners(
        {
          search,
          portal, // 👈 important
        },
        {
          page: Number(page) || 1,
          limit: Number(limit) || 20,
        }
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
        console.log(error)
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch banners",
      });
    }
  }
}

export default new BannerController();