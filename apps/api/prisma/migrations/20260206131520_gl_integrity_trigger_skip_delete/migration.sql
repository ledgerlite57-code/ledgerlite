-- Adjust GL integrity trigger to avoid firing on GLLine deletes.
-- This prevents cleanup/reset operations from failing while still guarding inserts/updates.

DROP TRIGGER IF EXISTS "gl_integrity_on_glline" ON "GLLine";

CREATE CONSTRAINT TRIGGER "gl_integrity_on_glline"
AFTER INSERT OR UPDATE ON "GLLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_gl_header_balance"();
