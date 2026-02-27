import 'dotenv/config';
import { PrismaClient, ServiceType, ServiceStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Health Services
  const services = await Promise.all([
    prisma.healthService.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Complete Blood Count (CBC)',
        type: ServiceType.LAB_TEST,
        originalPrice: 15.99,
        finalPrice: 12.99,
        status: ServiceStatus.ACTIVE
      }
    }),
    prisma.healthService.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'General Physician Consultation',
        type: ServiceType.CONSULTATION,
        originalPrice: 50.0,
        finalPrice: 45.0,
        status: ServiceStatus.ACTIVE
      }
    }),
    prisma.healthService.upsert({
      where: { id: '00000000-0000-0000-0000-000000000003' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Home Nursing Care (per visit)',
        type: ServiceType.HOME_CARE,
        originalPrice: 80.0,
        finalPrice: 70.0,
        status: ServiceStatus.ACTIVE
      }
    }),
    prisma.healthService.upsert({
      where: { id: '00000000-0000-0000-0000-000000000004' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'X-Ray Chest',
        type: ServiceType.DIAGNOSTICS,
        originalPrice: 35.0,
        finalPrice: 29.99,
        status: ServiceStatus.ACTIVE
      }
    }),
    prisma.healthService.upsert({
      where: { id: '00000000-0000-0000-0000-000000000005' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'Thyroid Profile',
        type: ServiceType.LAB_TEST,
        originalPrice: 45.0,
        finalPrice: 38.0,
        status: ServiceStatus.ACTIVE
      }
    }),
    prisma.healthService.upsert({
      where: { id: '00000000-0000-0000-0000-000000000006' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000006',
        name: 'ECG',
        type: ServiceType.DIAGNOSTICS,
        originalPrice: 25.0,
        finalPrice: 22.0,
        status: ServiceStatus.ACTIVE
      }
    })
  ]);

  console.log(`  Created ${services.length} health services`);

  // Seed Health Packages
  const basicPackage = await prisma.healthPackage.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      name: 'Basic Health Check',
      description: 'Essential lab tests and one general consultation',
      originalPrice: 120.0,
      finalPrice: 99.0,
      discountPct: 18,
      active: true,
      validityDays: 365
    }
  });

  const comprehensivePackage = await prisma.healthPackage.upsert({
    where: { id: '00000000-0000-0000-0000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      name: 'Comprehensive Wellness',
      description: 'Full body checkup with diagnostics and consultation',
      originalPrice: 250.0,
      finalPrice: 199.0,
      discountPct: 20,
      active: true,
      validityDays: 365
    }
  });

  const homeCarePackage = await prisma.healthPackage.upsert({
    where: { id: '00000000-0000-0000-0000-000000000103' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000103',
      name: 'Home Care Starter',
      description: '3 home nursing visits + one consultation',
      originalPrice: 200.0,
      finalPrice: 169.0,
      discountPct: 15,
      active: true,
      validityDays: 90
    }
  });

  console.log('  Created 3 health packages');

  // Link services to packages (PackageService)
  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: basicPackage.id,
        serviceId: services[0].id // CBC
      }
    },
    update: {},
    create: {
      packageId: basicPackage.id,
      serviceId: services[0].id
    }
  });
  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: basicPackage.id,
        serviceId: services[1].id // Consultation
      }
    },
    update: {},
    create: {
      packageId: basicPackage.id,
      serviceId: services[1].id
    }
  });

  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: comprehensivePackage.id,
        serviceId: services[0].id
      }
    },
    update: {},
    create: {
      packageId: comprehensivePackage.id,
      serviceId: services[0].id
    }
  });
  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: comprehensivePackage.id,
        serviceId: services[1].id
      }
    },
    update: {},
    create: {
      packageId: comprehensivePackage.id,
      serviceId: services[1].id
    }
  });
  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: comprehensivePackage.id,
        serviceId: services[3].id // X-Ray
      }
    },
    update: {},
    create: {
      packageId: comprehensivePackage.id,
      serviceId: services[3].id
    }
  });
  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: comprehensivePackage.id,
        serviceId: services[5].id // ECG
      }
    },
    update: {},
    create: {
      packageId: comprehensivePackage.id,
      serviceId: services[5].id
    }
  });

  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: homeCarePackage.id,
        serviceId: services[2].id // Home care
      }
    },
    update: {},
    create: {
      packageId: homeCarePackage.id,
      serviceId: services[2].id
    }
  });
  await prisma.packageService.upsert({
    where: {
      packageId_serviceId: {
        packageId: homeCarePackage.id,
        serviceId: services[1].id
      }
    },
    update: {},
    create: {
      packageId: homeCarePackage.id,
      serviceId: services[1].id
    }
  });

  console.log('  Linked services to packages');
  console.log('✅ Seeding completed.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
