-- Storage bucket for uploaded meet result PDFs.
--
-- Owned by Lane C (PDF pipeline). Lane A owns `0001_init.sql` (schema + RLS);
-- this migration is additive and intentionally lives in a separate file to
-- avoid merge conflicts.
--
-- Bucket is private (not publicly readable). Each user can read/write only the
-- PDFs they uploaded, identified by the path prefix `<auth.uid()>/...`.
-- The `/api/parse-pdf` route uploads to `meet-pdfs/<user_id>/<sha256>.pdf`.

insert into storage.buckets (id, name, public)
values ('meet-pdfs', 'meet-pdfs', false)
on conflict (id) do nothing;

-- Drop existing policies if re-running this migration locally
drop policy if exists "meet-pdfs uploader read" on storage.objects;
drop policy if exists "meet-pdfs uploader insert" on storage.objects;
drop policy if exists "meet-pdfs uploader delete" on storage.objects;

-- Read: only the file owner (path prefix matches their auth.uid)
create policy "meet-pdfs uploader read"
  on storage.objects for select
  using (
    bucket_id = 'meet-pdfs'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Insert: only into a folder named after the user's own auth.uid
create policy "meet-pdfs uploader insert"
  on storage.objects for insert
  with check (
    bucket_id = 'meet-pdfs'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Delete: only the file owner can delete
create policy "meet-pdfs uploader delete"
  on storage.objects for delete
  using (
    bucket_id = 'meet-pdfs'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
