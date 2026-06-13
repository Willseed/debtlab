-- Historical UTC+8 reset marker.
--
-- The current baseline migrations already create the UTC+8 schema, indexes,
-- and Easter egg seed data. Keep this migration number as a non-destructive
-- marker so new D1 databases apply the full sequence without replaying the
-- initial schema or deleting existing data.
PRAGMA foreign_keys = ON;
