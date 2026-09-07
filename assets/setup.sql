-- ============================================================
-- Hawk's Eye Media — Database Setup
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query
-- Paste everything below, then click "Run".
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- Categories ----------
create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ---------- Albums ----------
create table if not exists public.albums (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text unique,
  category_id uuid references public.categories(id) on delete set null,
  location text,
  event_date date,
  description text,
  tags text[],
  is_published boolean default false,
  is_featured boolean default false,
  featured_order int default 0,
  is_private boolean default false,
  allow_download boolean default false,
  allow_selection boolean default false,
  watermark_enabled boolean default true,
  cover_photo_id uuid,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Photos ----------
create table if not exists public.photos (
  id uuid primary key default uuid_generate_v4(),
  album_id uuid references public.albums(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  caption text,
  is_hidden boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- link albums.cover_photo_id -> photos.id (added after photos exists)
alter table public.albums
  drop constraint if exists albums_cover_photo_fk;
alter table public.albums
  add constraint albums_cover_photo_fk foreign key (cover_photo_id) references public.photos(id) on delete set null;

-- ---------- Services ----------
create table if not exists public.services (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ---------- Site settings (single row, id = 'main') ----------
create table if not exists public.site_settings (
  id text primary key default 'main',
  brand_name text,
  tagline text,
  hero_title text,
  hero_subtitle text,
  hero_image_path text,
  about_title text,
  about_short_bio text,
  about_long_bio text,
  about_philosophy text,
  about_experience_years int,
  about_profile_image_path text,
  whatsapp text,
  phone text,
  email text,
  instagram_url text,
  facebook_url text,
  watermark_enabled_default boolean default false,
  watermark_opacity_default numeric default 0.35,
  seo_title text,
  seo_description text,
  updated_at timestamptz default now()
);

insert into public.site_settings (id, brand_name, tagline, whatsapp, phone, email)
values ('main', 'Hawk''s Eye Media',
        'Cinematic photography that turns real moments, people and places into visual stories.',
        '201064675155', '+20 106 467 5155', 'islam.metwally@outlook.com')
on conflict (id) do nothing;

-- ---------- Inquiries ----------
create table if not exists public.inquiries (
  id uuid primary key default uuid_generate_v4(),
  name text,
  phone text,
  email text,
  service text,
  event_date date,
  location text,
  message text,
  status text default 'new',
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.categories enable row level security;
alter table public.albums enable row level security;
alter table public.photos enable row level security;
alter table public.services enable row level security;
alter table public.site_settings enable row level security;
alter table public.inquiries enable row level security;

-- Public (anon / publishable key) can only READ what should be public
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select using (true);

drop policy if exists "public read published albums" on public.albums;
create policy "public read published albums" on public.albums for select
  using (is_published = true and is_private = false);

drop policy if exists "public read visible photos" on public.photos;
create policy "public read visible photos" on public.photos for select
  using (
    is_hidden = false
    and exists (
      select 1 from public.albums a
      where a.id = album_id and a.is_published = true and a.is_private = false
    )
  );

drop policy if exists "public read active services" on public.services;
create policy "public read active services" on public.services for select using (is_active = true);

drop policy if exists "public read site settings" on public.site_settings;
create policy "public read site settings" on public.site_settings for select using (true);

-- Logged-in admin (authenticated) gets full read/write on everything
drop policy if exists "admin full categories" on public.categories;
create policy "admin full categories" on public.categories for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin full albums" on public.albums;
create policy "admin full albums" on public.albums for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin full photos" on public.photos;
create policy "admin full photos" on public.photos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin full services" on public.services;
create policy "admin full services" on public.services for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "admin update settings" on public.site_settings;
create policy "admin update settings" on public.site_settings for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Inquiries: anyone can submit (contact form), only admin can read/update
drop policy if exists "public submit inquiry" on public.inquiries;
create policy "public submit inquiry" on public.inquiries for insert with check (true);

drop policy if exists "admin read inquiries" on public.inquiries;
create policy "admin read inquiries" on public.inquiries for select
  using (auth.role() = 'authenticated');

drop policy if exists "admin update inquiries" on public.inquiries;
create policy "admin update inquiries" on public.inquiries for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- Storage bucket for photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('public-photos', 'public-photos', true)
on conflict (id) do nothing;

drop policy if exists "public read public-photos" on storage.objects;
create policy "public read public-photos" on storage.objects for select
  using (bucket_id = 'public-photos');

drop policy if exists "admin write public-photos" on storage.objects;
create policy "admin write public-photos" on storage.objects for insert
  with check (bucket_id = 'public-photos' and auth.role() = 'authenticated');

drop policy if exists "admin update public-photos" on storage.objects;
create policy "admin update public-photos" on storage.objects for update
  using (bucket_id = 'public-photos' and auth.role() = 'authenticated');

drop policy if exists "admin delete public-photos" on storage.objects;
create policy "admin delete public-photos" on storage.objects for delete
  using (bucket_id = 'public-photos' and auth.role() = 'authenticated');

-- ============================================================
-- (Optional) starter categories & services so the admin panel
-- isn't completely empty. Safe to delete/edit from the Admin UI later.
-- ============================================================
insert into public.categories (name, slug, sort_order) values
  ('Weddings', 'weddings', 1),
  ('Portraits', 'portraits', 2),
  ('Product', 'product', 3),
  ('Street', 'street', 4),
  ('Automotive', 'automotive', 5),
  ('Architecture', 'architecture', 6)
on conflict (slug) do nothing;

insert into public.services (title, sort_order, is_active) values
  ('Wedding Photography', 1, true),
  ('Portrait & Personal Sessions', 2, true),
  ('Commercial Photography', 3, true),
  ('Product Photography', 4, true),
  ('Fashion & Editorial', 5, true),
  ('Event Photography', 6, true),
  ('Real Estate & Architecture', 7, true),
  ('Automotive Photography', 8, true),
  ('Food Photography', 9, true),
  ('Travel & Street Photography', 10, true)
on conflict do nothing;
