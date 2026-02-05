-- Enforce GL header integrity at commit time (debits == credits and header totals match lines).
-- Deferrable constraint triggers allow multi-step posting inside a transaction.

CREATE OR REPLACE FUNCTION "enforce_gl_header_balance"() RETURNS trigger AS $$
DECLARE
  v_header_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
  v_line_debit numeric;
  v_line_credit numeric;
BEGIN
  IF TG_TABLE_NAME = 'GLLine' THEN
    v_header_id := COALESCE(NEW."headerId", OLD."headerId");
  ELSE
    v_header_id := COALESCE(NEW."id", OLD."id");
  END IF;

  IF v_header_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT h."totalDebit", h."totalCredit"
    INTO v_total_debit, v_total_credit
    FROM "GLHeader" h
   WHERE h."id" = v_header_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(l."debit"), 0), COALESCE(SUM(l."credit"), 0)
    INTO v_line_debit, v_line_credit
    FROM "GLLine" l
   WHERE l."headerId" = v_header_id;

  IF v_line_debit <> v_total_debit
     OR v_line_credit <> v_total_credit
     OR v_total_debit <> v_total_credit
  THEN
    RAISE EXCEPTION 'GL integrity violation for header %: header totals (%,%) lines (%,%)',
      v_header_id, v_total_debit, v_total_credit, v_line_debit, v_line_credit
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "gl_integrity_on_glline" ON "GLLine";
CREATE CONSTRAINT TRIGGER "gl_integrity_on_glline"
AFTER INSERT OR UPDATE OR DELETE ON "GLLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_gl_header_balance"();

DROP TRIGGER IF EXISTS "gl_integrity_on_glheader" ON "GLHeader";
CREATE CONSTRAINT TRIGGER "gl_integrity_on_glheader"
AFTER INSERT OR UPDATE OF "totalDebit","totalCredit" ON "GLHeader"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforce_gl_header_balance"();
