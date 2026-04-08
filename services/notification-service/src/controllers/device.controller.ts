import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const registerDevice = async (req: Request, res: Response) => {
  try {
    const { userId, fcmToken, platform } = req.body;

    if (!userId || !fcmToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const device = await prisma.userDevice.upsert({
      where: { fcmToken },
      update: {
        userId,
        platform: platform || "WEB",
      },
      create: {
        userId,
        fcmToken,
        platform: platform || "WEB",
      },
    });

    res.status(200).json({
      message: "Device registered successfully",
      data: device,
    });
  } catch (error) {
    console.error("[DeviceController] register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
