alter table public.posts
add column if not exists visibility text not null default 'public';

alter table public.posts
drop constraint if exists posts_visibility_check;

alter table public.posts
add constraint posts_visibility_check
check (visibility in ('public', 'followers'));
