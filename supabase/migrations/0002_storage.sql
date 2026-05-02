-- Storage: Dashboard → Storage → New bucket → id: captures, public: ON
-- Then run policies (adjust if your UI created the bucket already).

insert into storage.buckets (id, name, public)
values ('captures', 'captures', true)
on conflict (id) do nothing;

create policy captures_upload_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'captures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy captures_read on storage.objects
for select to authenticated
using (bucket_id = 'captures');

create policy captures_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'captures'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy captures_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'captures'
  and (storage.foldername(name))[1] = auth.uid()::text
);
