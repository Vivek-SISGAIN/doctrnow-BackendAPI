const prisma = require('../prisma/prisma');

/**
 * Searches specialties using a two-pass strategy (Prefix then Contains).
 */
async function searchSpecialties(query, limit = 5) {
  const qLimit = parseInt(limit, 10);

  // Single query: check BOTH prefix on full string AND word-boundary prefix
  const results = await prisma.$queryRaw`
    SELECT id, name, "imageKey"
    FROM specialty
    WHERE name ILIKE ${'%' + query + '%'}
    ORDER BY
      CASE 
        WHEN name ILIKE ${query + '%'} THEN 1
        WHEN name ILIKE ${'% ' + query + '%'} THEN 2
        ELSE 3
      END,
      name ASC
    LIMIT ${qLimit}
  `;

  return results.map(s => ({
    type: 'specialty',
    id: s.id,
    label: s.name,
    subLabel: '',
    imageUrl: null,
    _raw: s.name,
  }));
}

/**
 * Searches doctors using a two-pass strategy on fullName and primarySpecialization.
 */
async function searchDoctors(query, limit = 5) {
  const qLimit = parseInt(limit, 10);

  // Single query: check BOTH prefix on full string AND word-boundary prefix
  // This handles "Dr. Sarah Johnson" when user types "sar" or "sarah"
  const results = await prisma.$queryRaw`
    SELECT id, "fullName", "primarySpecialization", "profileImage"
    FROM doctor
    WHERE 
      "fullName" ILIKE ${'%' + query + '%'}
      OR "primarySpecialization" ILIKE ${'%' + query + '%'}
    ORDER BY
      CASE 
        WHEN "fullName" ILIKE ${query + '%'} THEN 1
        WHEN "fullName" ILIKE ${'% ' + query + '%'} THEN 2
        ELSE 3
      END,
      "fullName" ASC
    LIMIT ${qLimit}
  `;

  return results.map(d => ({
    type: 'doctor',
    id: d.id,
    label: d.fullName,
    subLabel: d.primarySpecialization,
    imageUrl: d.profileImage,
    _raw: `${d.fullName} ${d.primarySpecialization}`,
  }));
}

module.exports = { searchSpecialties, searchDoctors };
