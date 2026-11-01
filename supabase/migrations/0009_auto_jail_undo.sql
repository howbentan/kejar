-- Kejar check-ins follow-up (motion design §5b). A marshal can undo an auto-jail after a phone
-- fault; each undo is kept in safety_records with who did it, so the type check gains a value.
alter table safety_records drop constraint safety_records_type_check;
alter table safety_records add constraint safety_records_type_check
  check (type in ('sos', 'report', 'removed', 'auto-jail-undone'));
