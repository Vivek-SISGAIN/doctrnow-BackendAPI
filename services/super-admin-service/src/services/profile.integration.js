/**
 * profile.integration.js
 *
 * Fetches user profile data from the profile-service via the API Gateway.
 * All inter-service calls MUST route through process.env.API_GATEWAY.
 *
 * Returned shape (minimal, for ticket aggregation):
 * {
 *   userId, firstName, lastName, email, phone, avatarUrl, role
 * }
 */

import axios from "axios";
import { randomUUID } from "crypto";

/**
 * Build the standard internal-service headers.
 * The API Gateway JwtAuthGuard uses `x-internal-service-key` to bypass
 * user-facing JWT authentication for internal service-to-service calls.
 */
function buildInternalHeaders() {
  return {
    "X-Correlation-ID": randomUUID(),
    "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET || "",
    "Content-Type": "application/json",
  };
}

const GATEWAY = () => {
  const gw = process.env.API_GATEWAY;
  if (!gw) throw new Error("[ProfileIntegration] API_GATEWAY env var is not set");
  return gw;
};

/**
 * Fetch profile data for a single userId.
 * Returns null if not found or on network error (fail-safe for aggregation).
 *
 * @param {string} userId
 * @param {string} role  - "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "SUPER_ADMIN"
 * @returns {Promise<object|null>}
 */
export async function fetchUserProfile(userId, role) {
  try {
    const upperRole = (role || "").toUpperCase();
    let path;

    if (upperRole === "PATIENT") {
      path = `/profiles/patients/user/${userId}`;
    } else if (upperRole === "DOCTOR") {
      path = `/profiles/doctors/user/${userId}`;
    } else if (upperRole === "HOSPITAL_ADMIN") {
      path = `/profiles/hospital-admins/user/${userId}`;
    } else {
      // SUPER_ADMIN or unknown — we can only return minimal data
      return { userId, firstName: "Admin", lastName: "", email: "", phone: "", avatarUrl: null, role };
    }

    const { data } = await axios.get(`${GATEWAY()}${path}`, {
      headers: buildInternalHeaders(),
      timeout: 5000,
    });

    // Normalise the profile shape regardless of which role's profile was returned
    const profile = data?.data ?? data;
    return normaliseProfile(profile, userId, role);
  } catch (err) {
    // Never let profile fetch failures break the ticket response
    console.warn(`[ProfileIntegration] Failed to fetch profile for userId=${userId}:`, err?.message);
    return null;
  }
}

/**
 * Fetch profiles for multiple userIds in parallel.
 * Results are returned as a map: { [userId]: profileObject }
 *
 * @param {Array<{ userId: string, role: string }>} users
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchUserProfilesBatch(users) {
  if (!users || users.length === 0) return {};

  // Deduplicate by userId
  const unique = [...new Map(users.map((u) => [u.userId, u])).values()];

  const results = await Promise.allSettled(
    unique.map(({ userId, role }) => fetchUserProfile(userId, role))
  );

  const profileMap = {};
  unique.forEach(({ userId }, index) => {
    const result = results[index];
    if (result.status === "fulfilled" && result.value) {
      profileMap[userId] = result.value;
    }
  });

  return profileMap;
}

/**
 * Normalise any profile shape into a flat, predictable object.
 */
function normaliseProfile(profile, fallbackUserId, role) {
  if (!profile) return null;
  return {
    userId:     profile.userId   ?? profile.user_id   ?? fallbackUserId,
    firstName:  profile.firstName ?? profile.first_name ?? profile.name ?? "",
    lastName:   profile.lastName  ?? profile.last_name  ?? "",
    email:      profile.email     ?? "",
    phone:      profile.phone     ?? profile.phoneNumber ?? "",
    avatarUrl:  profile.avatarUrl ?? profile.avatar_url ?? profile.profileImage ?? null,
    role:       role,
  };
}
