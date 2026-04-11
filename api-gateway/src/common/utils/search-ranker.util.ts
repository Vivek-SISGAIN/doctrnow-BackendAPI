/**
 * Search Ranker
 *
 * Given raw results from each service, this module:
 *  1. Scores each item by how well it matches the query.
 *  2. Sorts each category descending by score.
 *  3. Returns the final { specialties, doctors, hospitals } payload.
 */

export interface SearchResultItem {
  id: string;
  label: string;
  subLabel?: string;
  imageUrl?: string | null;
  navigateTo?: string;
  type?: string;
  _raw?: string;
  _score?: number;
  [key: string]: any;
}

export interface SearchBuckets {
  specialties: SearchResultItem[];
  doctors: SearchResultItem[];
  hospitals: SearchResultItem[];
}

/**
 * @param label   - the item's display label
 * @param query   - the raw search term
 * @returns       - relevance score 0-100
 */
export function scoreItem(label: string, query: string): number {
  const l = label.toLowerCase().trim();
  const q = query.toLowerCase().trim();

  if (!q) return 0;
  if (l === q) return 100;
  if (l.startsWith(q)) return 85;
  if (l.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (l.includes(q)) return 30;
  return 0;
}

/**
 * Merges and ranks the search buckets based on relevance.
 * Items with a score of 0 are stripped if they don't match after DB filtering.
 *
 * @param buckets  - The categorized arrays of search results
 * @param query    - The search input
 */
export function mergeAndRank(buckets: SearchBuckets, query: string): SearchBuckets {
  const rank = (items: SearchResultItem[]) =>
    items
      .map((item) => ({ ...item, _score: scoreItem(item._raw || item.label, query) }))
      .sort((a, b) => (b._score || 0) - (a._score || 0))
      // Strip internal helpers before sending to client
      .map(({ _raw, _score, ...rest }) => rest as SearchResultItem);

  return {
    specialties: buckets.specialties ? rank(buckets.specialties) : [],
    doctors: buckets.doctors ? rank(buckets.doctors) : [],
    hospitals: buckets.hospitals ? rank(buckets.hospitals) : [],
  };
}
