/**
 * Consultation domain events
 */

export const CONSULTATION_EVENTS = {
  PATIENT_JOINED_LOBBY: 'patient_joined_lobby',
  CONSENT_REQUESTED: 'consent_requested',
  CONSENT_ACCEPTED: 'consent_accepted',
  CONSENT_REJECTED: 'consent_rejected',
  CALL_ENDED: 'call_ended',
} as const;

export type ConsultationEventType = typeof CONSULTATION_EVENTS[keyof typeof CONSULTATION_EVENTS];

export interface PatientJoinedLobbyEvent {
  appointmentId: string;
  consultationId?: string;
  doctorId?: string;
}

export interface ConsentRequestedEvent {
  appointmentId: string;
  consultationId?: string;
}

export interface ConsentAcceptedEvent {
  appointmentId: string;
  consultationId?: string;
}

export interface ConsentRejectedEvent {
  appointmentId: string;
  consultationId?: string;
}

export interface CallEndedEvent {
  appointmentId: string;
  consultationId?: string;
  endedBy: 'doctor' | 'patient';
  reason?: string;
}
