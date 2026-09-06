-- ============================================================
-- Hawk's Eye Media — Patch #2
-- Run this AFTER setup.sql, same way: SQL Editor → New query → Run
-- Adds: photo width/height columns, tags system (tags + album_tags)
-- ============================================================

-- Photos need width/height (used by the upload pipeline)
alter table public.photos add column if not exists width int;
alter table public.photos add column if not exists height int;

-- ---------- Tags ----------
create table if not exists public.tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique
);

create table if not exists public.album_tags (
  album_id uuid references public.albums(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (album_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.album_tags enable row level security;

drop policy if exists "public read tags" on public.tags;
create policy "public read tags" on public.tags for select using (true);

drop policy if exists "admin full tags" on public.tags;
create policy "admin full tags" on public.tags for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "public read album_tags" on public.album_tags;
create policy "public read album_tags" on public.album_tags for select using (true);

drop policy if exists "admin full album_tags" on public.album_tags;
create policy "admin full album_tags" on public.album_tags for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
