-- ============================================================================
-- DocuFlow AI - optional demo seed
--
-- The backend seeds demo data automatically in DEMO MODE, so this file is only
-- useful when you want to inspect the schema or load sample rows manually
-- against a real Supabase project.
--
-- IMPORTANT: replace the two user ids below with real auth.users ids from your
-- project (Dashboard -> Authentication -> Users).
-- ============================================================================

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000001'; -- <- replace
begin
  if not exists (select 1 from auth.users where id = v_user_id) then
    raise notice 'Skipping seed: user % does not exist. Replace the placeholder id first.', v_user_id;
    return;
  end if;

  insert into public.profiles (id, email, full_name)
  values (v_user_id, 'demo@docuflow.ai', 'Demo Reviewer')
  on conflict (id) do nothing;

  insert into public.documents (user_id, file_name, file_path, mime_type, document_type,
                                classification_confidence, status, progress, current_stage)
  values
    (v_user_id, 'invoice.pdf',            concat(v_user_id::text, '/demo-invoice.pdf'),   'application/pdf', 'invoice',        0.98, 'verified',     100, 'complete'),
    (v_user_id, 'invoice_discrepancy.pdf',concat(v_user_id::text, '/demo-invoice-2.pdf'), 'application/pdf', 'invoice',        0.98, 'needs_review', 100, 'complete'),
    (v_user_id, 'resume.pdf',             concat(v_user_id::text, '/demo-resume.pdf'),    'application/pdf', 'resume',         0.99, 'verified',     100, 'complete'),
    (v_user_id, 'contract.pdf',           concat(v_user_id::text, '/demo-contract.pdf'),  'application/pdf', 'contract',       0.98, 'verified',     100, 'complete'),
    (v_user_id, 'bank_statement.pdf',     concat(v_user_id::text, '/demo-bank.pdf'),      'application/pdf', 'bank_statement', 0.99, 'verified',     100, 'complete'),
    (v_user_id, 'receipt.jpg',            concat(v_user_id::text, '/demo-receipt.jpg'),   'image/jpeg',     'receipt',        0.96, 'verified',     100, 'complete')
  on conflict do nothing;

  raise notice 'Demo documents inserted for user %', v_user_id;
end $$;
