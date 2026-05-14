-- Odyssey website Supabase setup
-- Run this file in the Supabase SQL Editor before pointing the Node/Express server at Supabase.
-- The Express server uses SUPABASE_SERVICE_ROLE_KEY server-side for admin reads/updates and private uploads.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.general_enquiries (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text not null,
  business_name text not null,
  business_type text not null,
  service_interested_in text not null,
  message text not null,
  source_page text not null default '/',
  status text not null default 'New' check (
    status in ('New', 'Reviewed', 'Approved', 'Rejected', 'Contacted', 'Follow-up Needed', 'Converted', 'Archived')
  ),
  notes text not null default ''
);

create table if not exists public.business_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business_name text not null,
  category text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  location text not null,
  address text not null,
  website_link text,
  instagram_link text not null,
  tiktok_link text,
  booking_link text,
  whatsapp_link text,
  business_description text not null,
  unique_value text not null,
  main_products_services text not null,
  target_audience text not null,
  price_range text,
  opening_hours text,
  complimentary_shoot text not null check (complimentary_shoot in ('Yes', 'No')),
  status text not null default 'New' check (
    status in ('New', 'Reviewed', 'Approved', 'Rejected', 'Contacted', 'Follow-up Needed', 'Converted', 'Archived')
  ),
  notes text not null default '',
  profile_publication_status text not null default 'Not Published'
);

create table if not exists public.creator_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text not null,
  instagram_handle text not null,
  tiktok_handle text,
  youtube_link text,
  location text not null,
  content_type text not null,
  short_bio text not null,
  audience_size text,
  content_caption text not null,
  join_creator_program text not null check (join_creator_program in ('Yes', 'No')),
  open_to_paid_collabs text not null check (open_to_paid_collabs in ('Yes', 'No')),
  status text not null default 'New' check (
    status in ('New', 'Reviewed', 'Approved', 'Rejected', 'Contacted', 'Follow-up Needed', 'Converted', 'Archived')
  ),
  notes text not null default '',
  creator_program_status text not null default 'New'
);

create table if not exists public.partnership_enquiries (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text not null,
  company_name text not null,
  partnership_type text not null,
  message text not null,
  status text not null default 'New' check (
    status in ('New', 'Reviewed', 'Approved', 'Rejected', 'Contacted', 'Follow-up Needed', 'Converted', 'Archived')
  ),
  notes text not null default ''
);

create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  submission_type text not null check (submission_type in ('general', 'business', 'creator', 'partner')),
  submission_id uuid not null,
  field_name text not null,
  original_name text not null,
  file_name text not null,
  bucket text not null,
  object_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (
    event_name in (
      'cape_living_page_view',
      'get_featured_click',
      'business_submission',
      'creator_submission',
      'partner_enquiry',
      'business_website_click',
      'business_instagram_click',
      'business_whatsapp_click',
      'business_booking_click',
      'contact_enquiry'
    )
  ),
  event_path text,
  payload_json jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_json) = 'object'),
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists general_enquiries_submitted_at_idx on public.general_enquiries (submitted_at desc);
create index if not exists business_submissions_submitted_at_idx on public.business_submissions (submitted_at desc);
create index if not exists creator_submissions_submitted_at_idx on public.creator_submissions (submitted_at desc);
create index if not exists partnership_enquiries_submitted_at_idx on public.partnership_enquiries (submitted_at desc);
create index if not exists media_files_submission_idx on public.media_files (submission_type, submission_id);
create index if not exists tracking_events_created_at_idx on public.tracking_events (created_at desc);

drop trigger if exists set_general_enquiries_updated_at on public.general_enquiries;
create trigger set_general_enquiries_updated_at
before update on public.general_enquiries
for each row execute function public.set_updated_at();

drop trigger if exists set_business_submissions_updated_at on public.business_submissions;
create trigger set_business_submissions_updated_at
before update on public.business_submissions
for each row execute function public.set_updated_at();

drop trigger if exists set_creator_submissions_updated_at on public.creator_submissions;
create trigger set_creator_submissions_updated_at
before update on public.creator_submissions
for each row execute function public.set_updated_at();

drop trigger if exists set_partnership_enquiries_updated_at on public.partnership_enquiries;
create trigger set_partnership_enquiries_updated_at
before update on public.partnership_enquiries
for each row execute function public.set_updated_at();

alter table public.general_enquiries enable row level security;
alter table public.business_submissions enable row level security;
alter table public.creator_submissions enable row level security;
alter table public.partnership_enquiries enable row level security;
alter table public.media_files enable row level security;
alter table public.tracking_events enable row level security;

drop policy if exists "Public can insert general enquiries" on public.general_enquiries;
create policy "Public can insert general enquiries"
on public.general_enquiries
for insert
to anon, authenticated
with check (status = 'New' and notes = '');

drop policy if exists "Public can insert business submissions" on public.business_submissions;
create policy "Public can insert business submissions"
on public.business_submissions
for insert
to anon, authenticated
with check (status = 'New' and notes = '' and profile_publication_status = 'Not Published');

drop policy if exists "Public can insert creator submissions" on public.creator_submissions;
create policy "Public can insert creator submissions"
on public.creator_submissions
for insert
to anon, authenticated
with check (status = 'New' and notes = '' and creator_program_status = 'New');

drop policy if exists "Public can insert partnership enquiries" on public.partnership_enquiries;
create policy "Public can insert partnership enquiries"
on public.partnership_enquiries
for insert
to anon, authenticated
with check (status = 'New' and notes = '');

drop policy if exists "Public can insert tracking events" on public.tracking_events;
create policy "Public can insert tracking events"
on public.tracking_events
for insert
to anon, authenticated
with check (true);

drop policy if exists "Service role can manage general enquiries" on public.general_enquiries;
create policy "Service role can manage general enquiries"
on public.general_enquiries
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage business submissions" on public.business_submissions;
create policy "Service role can manage business submissions"
on public.business_submissions
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage creator submissions" on public.creator_submissions;
create policy "Service role can manage creator submissions"
on public.creator_submissions
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage partnership enquiries" on public.partnership_enquiries;
create policy "Service role can manage partnership enquiries"
on public.partnership_enquiries
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage media files" on public.media_files;
create policy "Service role can manage media files"
on public.media_files
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage tracking events" on public.tracking_events;
create policy "Service role can manage tracking events"
on public.tracking_events
for all
to service_role
using (true)
with check (true);

insert into storage.buckets (id, name, "public", file_size_limit, allowed_mime_types)
values
  (
    'business-uploads',
    'business-uploads',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
  ),
  (
    'creator-uploads',
    'creator-uploads',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
  ),
  (
    'partner-uploads',
    'partner-uploads',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
  ),
  (
    'general-enquiry-uploads',
    'general-enquiry-uploads',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
  )
on conflict (id) do update
set
  name = excluded.name,
  "public" = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Service role can manage Odyssey upload objects" on storage.objects;
create policy "Service role can manage Odyssey upload objects"
on storage.objects
for all
to service_role
using (bucket_id in ('business-uploads', 'creator-uploads', 'partner-uploads', 'general-enquiry-uploads'))
with check (bucket_id in ('business-uploads', 'creator-uploads', 'partner-uploads', 'general-enquiry-uploads'));

-- No public read policy is created for uploads. Admin media links are generated by the Express server
-- after password-protected admin authentication, then served as short-lived signed Supabase URLs.
