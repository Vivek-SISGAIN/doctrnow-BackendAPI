import { Request, Response } from 'express';
import axios from 'axios';

export class StripeStatusController {
  /**
   * GET /api/stripe-status
   * Read-only Stripe Connect onboarding status for the caller's own hospital.
   * No create/connect/resolve action lives here or ever should — those stay
   * SUPER_ADMIN-only in DOCTOR_NOW_ADMIN_FRONTEND.
   */
  async getStripeStatus(req: Request, res: Response) {
    const tenantId = req.headers['x-tenant-id'] as string | undefined;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing x-tenant-id header.'
      });
    }

    const base = process.env.SUPER_ADMIN_SERVICE_URL;
    if (!base) {
      console.error('SUPER_ADMIN_SERVICE_URL is not configured');
      return res.status(500).json({ success: false, message: 'Internal config error' });
    }

    try {
      const response = await axios.get(
        `${base}/internal/hospital/${tenantId}/stripe-status`,
        { headers: { 'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET } }
      );
      return res.status(200).json({ success: true, data: response.data.data });
    } catch (error: any) {
      if (error.response?.status === 404) {
        return res.status(404).json({ success: false, message: 'Hospital record not found.' });
      }
      console.error('Failed to fetch Stripe status from super-admin-service:', error.message);
      return res.status(502).json({ success: false, message: 'Unable to reach super-admin-service.' });
    }
  }
}

export default new StripeStatusController();
