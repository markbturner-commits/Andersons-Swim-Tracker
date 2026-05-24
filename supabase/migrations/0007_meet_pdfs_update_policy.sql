-- Add the missing UPDATE policy to the meet-pdfs storage bucket so that
-- `supabase.storage.from("meet-pdfs").upload(path, body, { upsert: true })`
-- works when the object already exists.
--
-- Symptom: clicking "Overwrite & re-parse" on a duplicate upload returned
-- "Couldn't save the PDF to storage: new row violates row-level security
-- policy" (code STORAGE_UPLOAD_FAILED). The pdf_uploads DB row was deleted
-- first, but the storage object at ${user_id}/${hash}.pdf survived from the
-- original upload, so upsert: true degraded to an UPDATE — and INSERT-only
-- policies don't cover it.
--
-- The other CRUD policies on this bucket already scope to
-- auth.uid()::text = (storage.foldername(name))[1]; this just adds UPDATE
-- to the set so users can rewrite objects inside their own folder.

create policy "meet-pdfs uploader update"
  on storage.objects
  for update
  using (
    bucket_id = 'meet-pdfs'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'meet-pdfs'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
