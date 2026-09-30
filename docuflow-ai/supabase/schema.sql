-- ============================================================================
-- DocuFlow AI - Supabase / PostgreSQL schema
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It creates the tables, indexes, foreign keys, Row Level Security policies
-- and the storage bucket used by the platform.
-- ============================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- ---------- profiles ----------
-- One row per authenticated user. Created automatically on sign-up.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- documents ----------
create table if not exists public.documents (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users (id) on delete cascade,
  file_name                 text not null,
  file_path                 text not null,
  file_size                 bigint,
  mime_type                 text,
  storage_backend           text default 'supabase-storage',
  document_type             text not null default 'unknown',
  classification_confidence numeric(4,3),
  classification_alternatives jsonb default '[]'::jsonb,
  status                    text not null default 'uploaded'
                            check (status in ('uploaded','processing','verified','reviewed',
                                              'needs_review','needs_attention','error')),
  status_reason             text,
  progress                  integer not null default 0 check (progress between 0 and 100),
  current_stage             text,
  stage_message             text,
  page_count                integer,
  ocr_text                  text,
  ocr_provider              text,
  ocr_meta                  jsonb default '{}'::jsonb,
  extraction_engine         text,
  validation_summary        jsonb default '{}'::jsonb,
  missing_fields            jsonb default '[]'::jsonb,
  error_message             text,
  processed_at              timestamptz,
  reviewed_at               timestamptz,
  reviewed_by               uuid references auth.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ---------- extracted_data ----------
create table if not exists public.extracted_data (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents (id) on delete cascade,
  field_name   text not null,
  field_value  jsonb,
  confidence   numeric(4,3) check (confidence between 0 and 1),
  reviewed     boolean not null default false,
  rejected     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (document_id, field_name)
);

-- ---------- validation_results ----------
create table if not exists public.validation_results (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete cascade,
  rule_name      text not null,
  label          text,
  status         text not null check (status in ('pass','fail','warning','skipped')),
  expected_value text,
  actual_value   text,
  message        text,
  created_at     timestamptz not null default now()
);

-- ---------- processing_logs ----------
create table if not exists public.processing_logs (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  stage       text not null,
  status      text not null,
  progress    integer,
  message     text,
  duration_ms integer,
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- chat_messages ----------
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  question    text not null,
  answer      text not null,
  grounded    boolean default true,
  source      text,
  confidence  numeric(4,3),
  created_at  timestamptz not null default now()
);

-- ---------- review_actions ----------
create table if not exists public.review_actions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  action         text not null,
  field_name     text,
  previous_value jsonb,
  new_value      jsonb,
  comment        text,
  created_at     timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

create index if not exists documents_user_id_idx            on public.documents (user_id);
create index if not exists documents_user_created_idx       on public.documents (user_id, created_at desc);
create index if not exists documents_user_status_idx        on public.documents (user_id, status);
create index if not exists documents_user_type_idx          on public.documents (user_id, document_type);
create index if not exists documents_file_name_idx          on public.documents (file_name);

create index if not exists extracted_data_document_idx      on public.extracted_data (document_id);
create index if not exists extracted_data_field_idx         on public.extracted_data (document_id, field_name);
-- Supports "find documents with this invoice number" without a full scan.
create index if not exists extracted_data_invoice_idx       on public.extracted_data (field_name, field_value)
  where field_name = 'invoice_number';

create index if not exists validation_results_document_idx  on public.validation_results (document_id);
create index if not exists validation_results_status_idx    on public.validation_results (document_id, status);

create index if not exists processing_logs_document_idx     on public.processing_logs (document_id, created_at);

create index if not exists chat_messages_document_idx       on public.chat_messages (document_id, created_at);
create index if not exists chat_messages_user_idx           on public.chat_messages (user_id);

create index if not exists review_actions_document_idx      on public.review_actions (document_id, created_at);
create index if not exists review_actions_user_idx          on public.review_actions (user_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

drop trigger if exists extracted_data_set_updated_at on public.extracted_data;
create trigger extracted_data_set_updated_at
  before update on public.extracted_data
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- AUTO-CREATE A PROFILE ON SIGN-UP
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- Users can only ever read or modify their own records.
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.documents         enable row level security;
alter table public.extracted_data    enable row level security;
alter table public.validation_results enable row level security;
alter table public.processing_logs   enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.review_actions    enable row level security;

-- ---------- profiles ----------
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ---------- documents ----------
drop policy if exists "Users can view their own documents" on public.documents;
create policy "Users can view their own documents"
  on public.documents for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own documents" on public.documents;
create policy "Users can create their own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own documents" on public.documents;
create policy "Users can update their own documents"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own documents" on public.documents;
create policy "Users can delete their own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

-- ---------- extracted_data (owned via the parent document) ----------
drop policy if exists "Users can view extracted data of their documents" on public.extracted_data;
create policy "Users can view extracted data of their documents"
  on public.extracted_data for select
  using (exists (
    select 1 from public.documents d
    where d.id = extracted_data.document_id and d.user_id = auth.uid()
  ));

drop policy if exists "Users can insert extracted data for their documents" on public.extracted_data;
create policy "Users can insert extracted data for their documents"
  on public.extracted_data for insert
  with check (exists (
    select 1 from public.documents d
    where d.id = extracted_data.document_id and d.user_id = auth.uid()
  ));

drop policy if exists "Users can update extracted data of their documents" on public.extracted_data;
create policy "Users can update extracted data of their documents"
  on public.extracted_data for update
  using (exists (
    select 1 from public.documents d
    where d.id = extracted_data.document_id and d.user_id = auth.uid()
  ));

drop policy if exists "Users can delete extracted data of their documents" on public.extracted_data;
create policy "Users can delete extracted data of their documents"
  on public.extracted_data for delete
  using (exists (
    select 1 from public.documents d
    where d.id = extracted_data.document_id and d.user_id = auth.uid()
  ));

-- ---------- validation_results ----------
drop policy if exists "Users can view validation results of their documents" on public.validation_results;
create policy "Users can view validation results of their documents"
  on public.validation_results for select
  using (exists (
    select 1 from public.documents d
    where d.id = validation_results.document_id and d.user_id = auth.uid()
  ));

drop policy if exists "Users can insert validation results for their documents" on public.validation_results;
create policy "Users can insert validation results for their documents"
  on public.validation_results for insert
  with check (exists (
    select 1 from public.documents d
    where d.id = validation_results.document_id and d.user_id = auth.uid()
  ));

drop policy if exists "Users can delete validation results of their documents" on public.validation_results;
create policy "Users can delete validation results of their documents"
  on public.validation_results for delete
  using (exists (
    select 1 from public.documents d
    where d.id = validation_results.document_id and d.user_id = auth.uid()
  ));

-- ---------- processing_logs ----------
drop policy if exists "Users can view processing logs of their documents" on public.processing_logs;
create policy "Users can view processing logs of their documents"
  on public.processing_logs for select
  using (exists (
    select 1 from public.documents d
    where d.id = processing_logs.document_id and d.user_id = auth.uid()
  ));

drop policy if exists "Users can insert processing logs for their documents" on public.processing_logs;
create policy "Users can insert processing logs for their documents"
  on public.processing_logs for insert
  with check (exists (
    select 1 from public.documents d
    where d.id = processing_logs.document_id and d.user_id = auth.uid()
  ));

drop policy if exists "Users can delete processing logs of their documents" on public.processing_logs;
create policy "Users can delete processing logs of their documents"
  on public.processing_logs for delete
  using (exists (
    select 1 from public.documents d
    where d.id = processing_logs.document_id and d.user_id = auth.uid()
  ));

-- ---------- chat_messages ----------
drop policy if exists "Users can view their own chat messages" on public.chat_messages;
create policy "Users can view their own chat messages"
  on public.chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own chat messages" on public.chat_messages;
create policy "Users can create their own chat messages"
  on public.chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own chat messages" on public.chat_messages;
create policy "Users can delete their own chat messages"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

-- ---------- review_actions ----------
drop policy if exists "Users can view their own review actions" on public.review_actions;
create policy "Users can view their own review actions"
  on public.review_actions for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own review actions" on public.review_actions;
create policy "Users can create their own review actions"
  on public.review_actions for insert
  with check (auth.uid() = user_id);

-- ============================================================================
-- STORAGE
-- A private bucket; each user may only touch objects under their own folder.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  15728640, -- 15 MB
  array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
)
on conflict (id) do nothing;

drop policy if exists "Users can read their own documents" on storage.objects;
create policy "Users can read their own documents"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload their own documents" on storage.objects;
create policy "Users can upload their own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own documents" on storage.objects;
create policy "Users can update their own documents"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own documents" on storage.objects;
create policy "Users can delete their own documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- DONE
-- ============================================================================
