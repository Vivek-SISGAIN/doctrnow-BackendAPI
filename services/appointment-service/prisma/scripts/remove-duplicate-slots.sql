-- Remove duplicate slots (same doctorId + startTime) before adding unique constraint.
-- For each duplicate group, keeps one slot: prefer the one that has an appointment, else min id.
-- Deletes other slots (and their slot_locks); appointments on deleted slots cascade-delete.
--
-- Run manually if the migration fails with "duplicate key":
--   psql $DATABASE_URL -f prisma/scripts/remove-duplicate-slots.sql
-- Then run: npx prisma migrate deploy

WITH dup AS (
  SELECT "doctorId", "startTime"
  FROM "slots"
  GROUP BY "doctorId", "startTime"
  HAVING count(*) > 1
),
keep AS (
  SELECT DISTINCT ON (s."doctorId", s."startTime") s."doctorId", s."startTime", s.id AS keep_id
  FROM "slots" s
  WHERE (s."doctorId", s."startTime") IN (SELECT "doctorId", "startTime" FROM dup)
  ORDER BY s."doctorId", s."startTime",
    EXISTS (SELECT 1 FROM "appointments" a WHERE a."slotId" = s.id) DESC,
    s.id ASC
)
DELETE FROM "slot_locks" l
WHERE l."slotId" IN (
  SELECT s.id FROM "slots" s
  JOIN dup d ON s."doctorId" = d."doctorId" AND s."startTime" = d."startTime"
  JOIN keep k ON k."doctorId" = s."doctorId" AND k."startTime" = s."startTime" AND s.id != k.keep_id
);

WITH dup AS (
  SELECT "doctorId", "startTime" FROM "slots"
  GROUP BY "doctorId", "startTime" HAVING count(*) > 1
),
keep AS (
  SELECT DISTINCT ON (s."doctorId", s."startTime") s."doctorId", s."startTime", s.id AS keep_id
  FROM "slots" s
  WHERE (s."doctorId", s."startTime") IN (SELECT "doctorId", "startTime" FROM dup)
  ORDER BY s."doctorId", s."startTime",
    EXISTS (SELECT 1 FROM "appointments" a WHERE a."slotId" = s.id) DESC,
    s.id ASC
)
DELETE FROM "slots" s
USING keep k
WHERE s."doctorId" = k."doctorId" AND s."startTime" = k."startTime" AND s.id != k.keep_id;
