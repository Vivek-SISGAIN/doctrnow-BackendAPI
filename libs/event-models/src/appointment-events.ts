/**
 * Appointment domain events
 */

export interface SlotCreatedEvent {
  eventType: 'SlotCreated';
  slotId: string;
  doctorId: string;
  startTime: Date;
  endTime: Date;
  timestamp: Date;
}

export interface AppointmentBookedEvent {
  eventType: 'AppointmentBooked';
  appointmentId: string;
  patientId: string;
  doctorId: string;
  slotId: string;
  appointmentTime: Date;
  timestamp: Date;
}

export interface AppointmentCancelledEvent {
  eventType: 'AppointmentCancelled';
  appointmentId: string;
  cancelledBy: string;
  reason?: string;
  timestamp: Date;
}

export interface AppointmentConfirmedEvent {
  eventType: 'AppointmentConfirmed';
  appointmentId: string;
  paymentStatus: string;
  timestamp: Date;
}

