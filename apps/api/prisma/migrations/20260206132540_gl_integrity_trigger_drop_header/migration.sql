-- Drop GLHeader trigger to avoid header inserts failing before lines are inserted.
-- GLLine trigger (deferred) still enforces integrity once lines are written.

DROP TRIGGER IF EXISTS "gl_integrity_on_glheader" ON "GLHeader";
