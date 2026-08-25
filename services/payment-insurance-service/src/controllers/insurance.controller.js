const { v4: uuidv4 } = require('uuid');

/**
 * Insurance Controller
 */
class InsuranceController {
  /**
   * Check insurance coverage
   */
  checkCoverage = async (req, res, next) => {
    try {
      const { emiratesId } = req.params;
      const { provider } = req.query;

      const coverage = {
        emiratesId,
        insuranceProvider: provider || 'Daman Health Insurance',
        policyNumber: `POL-${Math.floor(100000 + Math.random() * 900000)}`,
        status: 'ACTIVE',
        coveragePercentage: 80,
        copayAmount: 50.0,
        currency: 'AED',
        validUntil: '2026-12-31',
        network: 'Comprehensive Tier 1',
      };

      res.status(200).json({
        success: true,
        data: coverage,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Submit insurance claim
   */
  submitClaim = async (req, res, next) => {
    try {
      const { appointmentId, patientId, emiratesId, insuranceProvider, totalAmount } = req.body;

      if (!appointmentId || !patientId || !emiratesId) {
        return res.status(400).json({
          success: false,
          message: 'appointmentId, patientId, and emiratesId are required.',
        });
      }

      const copay = (parseFloat(totalAmount || 250) * 0.2).toFixed(2);
      const covered = (parseFloat(totalAmount || 250) * 0.8).toFixed(2);

      const claim = {
        id: uuidv4(),
        appointmentId,
        patientId,
        emiratesId,
        insuranceProvider: insuranceProvider || 'Daman Health Insurance',
        status: 'APPROVED',
        totalAmount: parseFloat(totalAmount || 250),
        coverageAmount: parseFloat(covered),
        copayAmount: parseFloat(copay),
        claimRef: `CLM-${Date.now()}`,
        submittedAt: new Date().toISOString(),
      };

      res.status(201).json({
        success: true,
        message: 'Insurance claim submitted and approved',
        data: claim,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get claim by ID
   */
  getClaimById = async (req, res, next) => {
    try {
      const { id } = req.params;
      res.status(200).json({
        success: true,
        data: {
          id,
          status: 'APPROVED',
          claimRef: `CLM-${id.substring(0, 8)}`,
          coveragePercentage: 80,
          copayAmount: 50.0,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new InsuranceController();
