const { v4: uuidv4 } = require('uuid');

/**
 * Payment Controller
 */
class PaymentController {
  /**
   * Process payment
   */
  processPayment = async (req, res, next) => {
    try {
      const { appointmentId, patientId, amount, paymentMethod, currency = 'AED' } = req.body;

      if (!appointmentId || !patientId || !amount) {
        return res.status(400).json({
          success: false,
          message: 'appointmentId, patientId, and amount are required.',
        });
      }

      const transaction = {
        id: uuidv4(),
        appointmentId,
        patientId,
        amount: parseFloat(amount),
        currency,
        status: 'SUCCESS',
        paymentMethod: paymentMethod || 'CREDIT_CARD',
        gateway: 'STRIPE_SANDBOX',
        gatewayRef: `gw_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        createdAt: new Date().toISOString(),
      };

      res.status(201).json({
        success: true,
        message: 'Payment processed successfully',
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get payment details
   */
  getPaymentById = async (req, res, next) => {
    try {
      const { id } = req.params;
      res.status(200).json({
        success: true,
        data: {
          id,
          status: 'SUCCESS',
          amount: 250.0,
          currency: 'AED',
          paymentMethod: 'CREDIT_CARD',
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Process Refund
   */
  processRefund = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      res.status(200).json({
        success: true,
        message: 'Refund initiated successfully',
        data: {
          refundId: uuidv4(),
          transactionId: id,
          amount: amount || 250.0,
          reason: reason || 'Patient cancelled consultation',
          status: 'PROCESSED',
          processedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new PaymentController();
