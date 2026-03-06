/**
 * Payment domain events
 */

export interface PaymentSuccessEvent {
  eventType: 'PaymentSuccess';
  transactionId: string;
  appointmentId: string;
  amount: number;
  gatewayRef: string;
  timestamp: Date;
}

export interface PaymentFailedEvent {
  eventType: 'PaymentFailed';
  transactionId: string;
  appointmentId: string;
  reason: string;
  timestamp: Date;
}

export interface RefundProcessedEvent {
  eventType: 'RefundProcessed';
  refundId: string;
  transactionId: string;
  amount: number;
  timestamp: Date;
}

export interface InsuranceClaimSubmittedEvent {
  eventType: 'InsuranceClaimSubmitted';
  claimId: string;
  appointmentId: string;
  emiratesId: string;
  copayAmount: number;
  timestamp: Date;
}

