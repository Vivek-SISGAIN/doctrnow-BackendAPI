import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function getRealUserIds() {
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET || "super_secret_internal_key_123";
  const baseUrl = process.env.API_GATEWAY || "http://localhost:8080/api/v1";
  
  const headers = {
    "X-Correlation-ID": randomUUID(),
    "x-internal-service-key": internalSecret,
  };

  // User provided specific patient ID
  const providedPatientId = "e6a4b476-7597-4183-9099-8d1d0edbcc84";

  try {
    const { data: dData } = await axios.get(`${baseUrl}/profiles/doctors`, { headers });
    const doctors = dData?.data || [];

    return {
      patientId: providedPatientId,
      doctorId: doctors.length > 0 ? doctors[0].userId : "doc-456"
    };
  } catch (err) {
    console.error("Failed to fetch doctor, using dummy:", err.message);
    return { patientId: providedPatientId, doctorId: "doc-456" };
  }
}

async function main() {
  console.log("Seeding Support Tickets...");

  const { patientId, doctorId } = await getRealUserIds();
  console.log(`Using Patient ID: ${patientId}`);
  console.log(`Using Doctor ID: ${doctorId}`);

  // Clear existing tickets if any for a clean slate
  await prisma.ticketTimeline.deleteMany();
  await prisma.supportTicket.deleteMany();

  const tickets = [
    {
      ticketCode: "TK-001",
      userId: patientId,
      userRole: "PATIENT",
      category: "Booking_Issue",
      subject: "Unable to book appointment with Dr. Sharma",
      description: "I have been trying to book an appointment for the past two days but the slot keeps showing unavailable even after selecting a time.",
      status: "in_progress",
      priority: "High",
      timeline: {
        create: [
          { text: "Ticket submitted", actor: "USER", userId: patientId, isSystem: false },
          { text: "Support agent is looking into the slot availability issue.", actor: "ADMIN", userId: "admin-1", isSystem: false }
        ]
      }
    },
    {
      ticketCode: "TK-002",
      userId: patientId,
      userRole: "PATIENT",
      category: "Payment_Problem",
      subject: "Payment deducted but appointment not confirmed",
      description: "My bank shows a deduction of AED 150 but the app still shows the appointment as pending.",
      status: "open",
      priority: "High",
      timeline: {
        create: [
          { text: "Ticket submitted", actor: "USER", userId: patientId, isSystem: false }
        ]
      }
    },
    {
      ticketCode: "TK-003",
      userId: patientId,
      userRole: "PATIENT",
      category: "Technical_Issue",
      subject: "App crashes when opening health records",
      description: "Every time I navigate to the health records section the app closes unexpectedly.",
      status: "open",
      priority: "Medium",
      timeline: {
        create: [
          { text: "Ticket submitted", actor: "USER", userId: patientId, isSystem: false }
        ]
      }
    },
    {
      ticketCode: "TK-004",
      userId: doctorId,
      userRole: "DOCTOR",
      category: "Doctor_Query",
      subject: "Need specialist referral for cardiology",
      description: "My GP advised a cardiology consultation. Can the platform help with a referral or direct booking?",
      status: "in_progress",
      priority: "Medium",
      timeline: {
        create: [
          { text: "Ticket submitted", actor: "USER", userId: doctorId, isSystem: false },
          { text: "Referred to our medical coordination team for assistance.", actor: "ADMIN", userId: "admin-1", isSystem: false }
        ]
      }
    },
    {
      ticketCode: "TK-005",
      userId: patientId,
      userRole: "PATIENT",
      category: "Other",
      subject: "Request for medical certificate download",
      description: "I completed a health check-up package last week and need the medical certificate for my visa application.",
      status: "resolved",
      priority: "Low",
      timeline: {
        create: [
          { text: "Ticket submitted", actor: "USER", userId: patientId, isSystem: false },
          { text: "Your medical certificate has been sent to your registered email.", actor: "ADMIN", userId: "admin-1", isSystem: false }
        ]
      }
    }
  ];

  for (const ticketData of tickets) {
    await prisma.supportTicket.create({
      data: ticketData
    });
  }

  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
