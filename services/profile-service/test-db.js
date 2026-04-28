const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const doctor = await prisma.doctor.findFirst({
    orderBy: { updatedAt: 'desc' }
  });
  console.log(doctor.profileImage);
}

main().catch(console.error).finally(() => prisma.$disconnect());
