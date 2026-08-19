-- Allow richer media sharing while keeping a bounded per-object limit.
update storage.buckets
set file_size_limit = 52428800
where id in ('chat-files', 'story-media');

update storage.buckets
set file_size_limit = 10485760
where id = 'profile-avatars';
