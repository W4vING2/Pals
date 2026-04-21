alter table public.comments
add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

create index if not exists idx_comments_parent_comment_id
on public.comments(parent_comment_id);

create or replace function validate_comment_thread_parent()
returns trigger language plpgsql as $$
declare
  parent_post_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  if new.parent_comment_id = new.id then
    raise exception 'Comment cannot reply to itself';
  end if;

  select post_id into parent_post_id
  from public.comments
  where id = new.parent_comment_id;

  if parent_post_id is null then
    raise exception 'Parent comment does not exist';
  end if;

  if parent_post_id <> new.post_id then
    raise exception 'Parent comment belongs to a different post';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_comment_thread_parent on public.comments;
create trigger trg_validate_comment_thread_parent
before insert or update on public.comments
for each row execute function validate_comment_thread_parent();

create or replace function update_post_comments_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comments_count = comments_count + 1 where id = new.post_id;

    insert into public.notifications(user_id, actor_id, type, post_id, comment_id)
    select p.user_id, new.user_id, 'comment', new.post_id, new.id
    from public.posts p
    where p.id = new.post_id and p.user_id <> new.user_id;

    if new.parent_comment_id is not null then
      insert into public.notifications(user_id, actor_id, type, post_id, comment_id)
      select c.user_id, new.user_id, 'comment', new.post_id, new.id
      from public.comments c
      where c.id = new.parent_comment_id
        and c.user_id <> new.user_id
        and c.user_id <> (
          select p.user_id
          from public.posts p
          where p.id = new.post_id
        );
    end if;
  elsif tg_op = 'DELETE' then
    update public.posts set comments_count = greatest(0, comments_count - 1) where id = old.post_id;
  end if;

  return null;
end;
$$;
