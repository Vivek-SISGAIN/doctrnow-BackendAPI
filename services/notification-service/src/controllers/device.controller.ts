import { Request, Response } from "express";
import { PrismaClient, Platform } from "@prisma/client";

const prisma = new PrismaClient();

export const registerDevice = async (req: Request, res: Response) => {
  try {
    const headerUserId = String(req.headers["x-user-id"] || "").trim();
    const bodyUserId = String(req.body?.userId || "").trim();
    const userId = headerUserId || bodyUserId;

    const fcmToken = String(req.body?.fcmToken || "").trim();
    const platformInput = String(req.body?.platform || req.body?.deviceType || "").trim();
    const normalizedPlatform = platformInput.toUpperCase();
    const platform: Platform = (Object.values(Platform) as string[]).includes(normalizedPlatform)
      ? (normalizedPlatform as Platform)
      : Platform.WEB;

    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }

    if (!fcmToken) {
      return res.status(400).json({ error: "Missing required field: fcmToken" });
    }

    const device = await prisma.userDevice.upsert({
      where: { fcmToken },
      update: {
        userId,
        platform,
      },
      create: {
        userId,
        fcmToken,
        platform,
      },
    });

    console.log(
      `[DeviceController] Registered device userId=${userId} platform=${platform} token=${fcmToken.slice(0, 12)}...`,
    );

    res.status(200).json({
      message: "Device registered successfully",
      data: device,
    });
  } catch (error) {
    console.error("[DeviceController] register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const listDevicesForUser = async (req: Request, res: Response) => {
  try {
    const headerUserId = String(req.headers["x-user-id"] || "").trim();
    const paramUserId = String(req.params?.userId || "").trim();
    const queryUserId = String(req.query?.userId || "").trim();

    const userId = paramUserId || queryUserId || headerUserId;
    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }

    const devices = await prisma.userDevice.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json({
      userId,
      count: devices.length,
      devices: devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        fcmToken: `${d.fcmToken.slice(0, 12)}...`,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (error) {
    console.error("[DeviceController] listDevicesForUser error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const unregisterDevice = async (req: Request, res: Response) => {
  try {
    const headerUserId = String(req.headers["x-user-id"] || "").trim();
    const bodyUserId   = String(req.body?.userId || "").trim();
    const userId       = headerUserId || bodyUserId;
    const fcmToken     = String(req.body?.fcmToken || "").trim();

    if (!userId || !fcmToken) {
      return res.status(400).json({ error: "Missing required fields: userId and fcmToken" });
    }

    await prisma.userDevice.deleteMany({
      where: { userId, fcmToken },
    });

    return res.status(200).json({ success: true, message: "Device unregistered successfully" });
  } catch (error) {
    console.error("[DeviceController] unregisterDevice error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
