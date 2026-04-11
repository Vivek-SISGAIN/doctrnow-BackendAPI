import prisma from '../prisma/client.js';

/**
 * Searches hospitals using a two-pass strategy (Prefix then Contains).
 * Maps `official_name`
 */
export async function searchHospitals(query, limit = 5) {
  const qLimit = parseInt(limit, 10);

  // Single query: check BOTH prefix on full string AND word-boundary prefix
  const results = await prisma.$queryRaw`
    SELECT id, official_name as "officialName",short_name as "shortName", emirate
    FROM hospitals
    WHERE 
    official_name ILIKE ${'%' + query + '%'}
    or
    short_name ILIKE ${'%' + query + '%'}
    ORDER BY
      CASE 
        WHEN official_name ILIKE ${query + '%'} THEN 1
        WHEN official_name ILIKE ${'% ' + query + '%'} THEN 2
        WHEN short_name ILIKE ${query + '%'} THEN 3
        WHEN short_name ILIKE ${'% ' + query + '%'} THEN 4
        ELSE 5
      END,
      official_name ASC
    LIMIT ${qLimit}
  `;

  return results.map(h => ({
    type: 'hospital',
    id: h.id,
    label: h.officialName,
    subLabel: h.shortName || h.emirate || '',
    imageUrl: null,
    _raw: h.officialName,
  }));
}
