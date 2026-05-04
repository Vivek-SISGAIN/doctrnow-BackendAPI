const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSentPush() {
  const sentPush = await prisma.notification.findMany({
    where: { 
      channel: 'PUSH',
      status: 'SENT'
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log('Sent Push Notifications:', JSON.stringify(sentPush, null, 2));
  await prisma.$disconnect();
}

checkSentPush();
