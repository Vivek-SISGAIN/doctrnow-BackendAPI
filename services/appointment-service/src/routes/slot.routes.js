const express = require("express");
const router = express.Router();
const {
  getAvailableSlots,
  getSlotsByDoctor,
  getSlotById,
  createSlot,
  createBulkSlots,
  updateSlot,
  deleteSlot,
  lockSlot,
  unlockSlot,
  getNextAvailableSlotsBulk,
} = require("../controllers/slot.controller");
const {
  createSlotSchema,
  createBulkSlotsSchema,
  updateSlotSchema,
} = require("../validations/slot.validation");
const validate = require("../middleware/validation");

/**
 * @swagger
 * /api/slots/available:
 *   get:
 *     summary: Get available slots for a doctor
 *     tags: [Slots]
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Doctor ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for slot search
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for slot search
 *     responses:
 *       200:
 *         description: List of available slots
 */
router.get("/available", getAvailableSlots);

/**
 * @swagger
 * /api/slots/doctor/{doctorId}:
 *   get:
 *     summary: Get all slots for a doctor
 *     tags: [Slots]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Doctor ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [AVAILABLE, BOOKED, CANCELLED, BLOCKED]
 *         description: Filter by slot status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter slots from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter slots until this date
 *     responses:
 *       200:
 *         description: List of slots
 */
router.get("/doctor/:doctorId", getSlotsByDoctor);

/**
 * @swagger
 * /api/slots/{id}:
 *   get:
 *     summary: Get slot by ID
 *     tags: [Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Slot ID
 *     responses:
 *       200:
 *         description: Slot found
 *       404:
 *         description: Slot not found
 */
router.get("/:id", getSlotById);

/**
 * @swagger
 * /api/slots:
 *   post:
 *     summary: Create a new slot
 *     tags: [Slots]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctorId
 *               - startTime
 *               - endTime
 *             properties:
 *               doctorId:
 *                 type: string
 *                 format: uuid
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, BOOKED, CANCELLED, BLOCKED]
 *     responses:
 *       201:
 *         description: Slot created successfully
 *       400:
 *         description: Validation error
 */
router.post("/", validate(createSlotSchema), createSlot);

/**
 * @swagger
 * /api/slots/bulk:
 *   post:
 *     summary: Create multiple slots at once
 *     tags: [Slots]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctorId
 *               - slots
 *             properties:
 *               doctorId:
 *                 type: string
 *                 format: uuid
 *               slots:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - startTime
 *                     - endTime
 *                   properties:
 *                     startTime:
 *                       type: string
 *                       format: date-time
 *                     endTime:
 *                       type: string
 *                       format: date-time
 *                     status:
 *                       type: string
 *                       enum: [AVAILABLE, BOOKED, CANCELLED, BLOCKED]
 *     responses:
 *       201:
 *         description: Slots created successfully
 */
router.post("/bulk", createBulkSlots);

/**
 * @swagger
 * /api/slots/{id}:
 *   patch:
 *     summary: Update slot
 *     tags: [Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, BOOKED, CANCELLED, BLOCKED]
 *     responses:
 *       200:
 *         description: Slot updated successfully
 */
router.patch("/:id", validate(updateSlotSchema), updateSlot);

/**
 * @swagger
 * /api/slots/{id}:
 *   delete:
 *     summary: Delete slot
 *     tags: [Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Slot deleted successfully
 */
router.delete("/:id", deleteSlot);

/**
 * @swagger
 * /api/slots/{id}/lock:
 *   post:
 *     summary: Lock a slot (prevent double-booking)
 *     tags: [Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lockedBy:
 *                 type: string
 *               expiresInMinutes:
 *                 type: integer
 *                 default: 5
 *     responses:
 *       200:
 *         description: Slot locked successfully
 */
router.post("/:id/lock", lockSlot);

/**
 * @swagger
 * /api/slots/{id}/unlock:
 *   post:
 *     summary: Unlock a slot
 *     tags: [Slots]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Slot unlocked successfully
 */
router.post("/:id/unlock", unlockSlot);

// Internal-only: trigger slot maintenance manually (for testing/ops)
// Should be protected by internal service secret in production
router.post("/internal/slot-maintenance/run", async (req, res, next) => {
  try {
    const slotService = require("../service/slot.service");
    const prisma = require("../prisma/prisma");
    const dayjs = require("dayjs");
    const utc = require("dayjs/plugin/utc");
    const timezone = require("dayjs/plugin/timezone");
    dayjs.extend(utc);
    dayjs.extend(timezone);

    const UAE_TZ = "Asia/Dubai";

    // Step 1: delete yesterday's unbooked slots
    const deleteResult = await slotService.deleteYesterdayAvailableSlots();

    // Step 2: fetch each active doctor from profile-service
    let doctors = [];
    try {
      const axios = require("axios");
      const gatewayUrl = process.env.BASE_URL;
      if (!gatewayUrl) throw new Error("BASE_URL not configured");

      const baseUrl = gatewayUrl.endsWith("/") ? gatewayUrl : `${gatewayUrl}/`;
      const url = `${baseUrl}profiles/doctors?status=ACTIVE`;

      const res = await axios.get(url, {
        headers: {
          ...(process.env.INTERNAL_SERVICE_SECRET
            ? { "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET }
            : {}),
        },
        timeout: 5000,
      });

      doctors = res.data?.data || [];
    } catch (err) {
      console.error(`[SlotMaintenanceRoute] Failed to fetch active doctors: ${err.message}`);
      return res.status(502).json({
        success: false,
        message: "Failed to fetch active doctors from profile-service",
        error: err.message,
      });
    }

    const results = [];
    for (const doctor of doctors) {
      if (!doctor.schedule) continue;
      const r = await slotService.extendSlotsByOneDay(doctor.id, doctor.schedule);
      if (r.generated > 0 || r.newDate) {
        results.push({ doctorId: doctor.id, ...r });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        deleted: deleteResult.deleted,
        deletedDate: deleteResult.date,
        extensions: results,
      },
    });
  } catch (err) {
    next(err);
  }
});
/**
 * @swagger
 * /api/slots/next-available/bulk:
 *   post:
 *     summary: Get the first available future slot for multiple doctors
 *     tags: [Slots]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [doctorIds]
 *             properties:
 *               doctorIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Map of doctorId to next available slot
 */
router.post("/next-available/bulk", getNextAvailableSlotsBulk);

module.exports = router;
