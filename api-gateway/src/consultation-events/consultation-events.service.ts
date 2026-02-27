import { Injectable } from '@nestjs/common';
import { ConsultationEventsGateway, CONSULTATION_EVENTS } from './consultation-events.gateway';

@Injectable()
export class ConsultationEventsService {
  constructor(private readonly gateway: ConsultationEventsGateway) {}

  patientJoinedLobby(appointmentId: string, consultationId?: string, doctorId?: string): void {
    const payload = { appointmentId, consultationId };
    if (doctorId) {
      this.gateway.emitToDoctorRoom(doctorId, CONSULTATION_EVENTS.PATIENT_JOINED_LOBBY, payload);
    } else {
      this.gateway.emitToRoom(appointmentId, CONSULTATION_EVENTS.PATIENT_JOINED_LOBBY, payload);
    }
  }

  consentRequested(appointmentId: string, consultationId?: string): void {
    this.gateway.emitToRoom(appointmentId, CONSULTATION_EVENTS.CONSENT_REQUESTED, {
      appointmentId,
      consultationId,
    });
  }

  consentAccepted(appointmentId: string, consultationId?: string): void {
    this.gateway.emitToRoom(appointmentId, CONSULTATION_EVENTS.CONSENT_ACCEPTED, {
      appointmentId,
      consultationId,
    });
  }

  consentRejected(appointmentId: string, consultationId?: string): void {
    this.gateway.emitToRoom(appointmentId, CONSULTATION_EVENTS.CONSENT_REJECTED, {
      appointmentId,
      consultationId,
    });
  }

  callEnded(appointmentId: string, endedBy: 'doctor' | 'patient', consultationId?: string, reason?: string): void {
    this.gateway.emitToRoom(appointmentId, CONSULTATION_EVENTS.CALL_ENDED, {
      appointmentId,
      consultationId,
      endedBy,
      reason,
    });
  }
}
