const prisma = require('../prisma/prisma');

class SpecialtyService {
  /**
   * Find all specialties with doctor count (doctors where primarySpecialization matches specialty name)
   */
  async findAllWithDoctorCount() {
    const specialties = await prisma.specialty.findMany({
      orderBy: { displayOrder: 'asc' }
    });

    const withCount = await Promise.all(
      specialties.map(async (s) => {
        const doctorCount = await prisma.doctor.count({
          where: {
            status: 'ACTIVE',
            primarySpecialization: { equals: s.name, mode: 'insensitive' }
          }
        });
        return { ...s, doctorCount };
      })
    );

    return withCount;
  }

  findById(id) {
    return prisma.specialty.findUnique({
      where: { id }
    });
  }

  findBySlug(slug) {
    return prisma.specialty.findUnique({
      where: { slug }
    });
  }
}

module.exports = new SpecialtyService();
