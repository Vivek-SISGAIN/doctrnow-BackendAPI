import { Request, Response } from 'express';
import axios from 'axios';

export class StripeStatusController {
  /**
   * GET /api/stripe-status
   * Returns the hospital's Stripe Connect onboarding status.
   *
   * Calls the payment-service's /sync-status endpoint which fetches live data
   * directly from the Stripe API and auto-updates the DB. This ensures the
   * status is always accurate even when webhooks are not delivered (e.g. local
   * dev without Stripe CLI, or any missed webhook event).
   */
  async getStripeStatus(req: Request, res: Response) {
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    const role     = req.headers['x-user-role']  as string | undefined;
    const userId   = req.headers['x-user-id']    as string | undefined;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: 'Missing x-tenant-id header.'
      });
    }

    const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL;
    if (!paymentServiceUrl) {
      console.error('PAYMENT_SERVICE_URL is not configured');
      return res.status(500).json({ success: false, message: 'Internal config error' });
    }

    try {
      // Forward the JWT-derived headers so the payment service can authenticate
      // the caller and resolve their hospitalId from x-tenant-id.
      const response = await axios.get(
        `${paymentServiceUrl}/api/payments/stripe/sync-status`,
        {
          headers: {
            'x-user-role':  role   || '',
            'x-tenant-id':  tenantId,
            'x-user-id':    userId || '',
            'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET,
          },
        }
      );
      return res.status(200).json(response.data);
    } catch (error: any) {
      console.error('Failed to sync Stripe status from payment-service:', error.message);

      // Graceful fallback — read stale DB status rather than showing an error
      const superAdminBase = process.env.SUPER_ADMIN_SERVICE_URL;
      if (!superAdminBase) {
        return res.status(502).json({ success: false, message: 'Unable to reach payment-service.' });
      }
      try {
        const fallback = await axios.get(
          `${superAdminBase}/internal/hospital/${tenantId}/stripe-status`,
          { headers: { 'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET } }
        );
        return res.status(200).json({ success: true, data: fallback.data.data });
      } catch {
        return res.status(200).json({
          success: true,
          data: {
            stripeAccountId: null,
            stripeOnboardingStatus: 'NOT_STARTED',
            stripeChargesEnabled: false,
            stripePayoutsEnabled: false,
          },
        });
      }
    }
  }
}

export default new StripeStatusController();


