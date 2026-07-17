create extension if not exists pgcrypto;
create type public.comment_display_mode as enum ('account','anonymous');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.comments (
  id uuid primary key default gen_random_uuid(), work_id text not null check (char_length(work_id) between 1 and 128),
  parent_id uuid references public.comments(id), display_mode public.comment_display_mode not null,
  public_profile_id uuid references public.profiles(user_id), body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz,
  constraint display_profile_consistency check ((display_mode='account' and public_profile_id is not null) or (display_mode='anonymous' and public_profile_id is null))
);
create table public.comment_authorship (comment_id uuid primary key references public.comments(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade);
create table public.comment_votes (comment_id uuid references public.comments(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, value smallint not null check(value in (-1,1)), created_at timestamptz not null default now(), primary key(comment_id,user_id));
create table public.comment_reports (comment_id uuid references public.comments(id) on delete cascade, reporter_user_id uuid references auth.users(id) on delete cascade, reason text not null check(reason in ('spam','harassment','other')), created_at timestamptz not null default now(), primary key(comment_id,reporter_user_id));
create table public.bookmarks (user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, work_id text not null check(char_length(work_id) between 1 and 128), created_at timestamptz not null default now(), primary key(user_id,work_id));
create index comments_work_cursor_idx on public.comments(work_id,created_at desc,id desc) where parent_id is null;
create index comments_parent_idx on public.comments(parent_id,created_at,id);
create index comments_profile_idx on public.comments(public_profile_id);
create index authorship_user_idx on public.comment_authorship(user_id,comment_id);
create index votes_user_idx on public.comment_votes(user_id);
create index reports_reporter_idx on public.comment_reports(reporter_user_id);
create index bookmarks_work_idx on public.bookmarks(work_id);

alter table public.profiles enable row level security; alter table public.comments enable row level security;
alter table public.comment_authorship enable row level security; alter table public.comment_votes enable row level security;
alter table public.comment_reports enable row level security; alter table public.bookmarks enable row level security;
create policy profiles_public_read on public.profiles for select using(true);
create policy profiles_own_insert on public.profiles for insert to authenticated with check(user_id=auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy comments_public_read on public.comments for select using(true);
-- No authorship policies: even authors cannot enumerate this private mapping. SECURITY DEFINER RPCs verify ownership.
create policy bookmarks_own_select on public.bookmarks for select to authenticated using(user_id=auth.uid());
create policy bookmarks_own_insert on public.bookmarks for insert to authenticated with check(user_id=auth.uid());
create policy bookmarks_own_delete on public.bookmarks for delete to authenticated using(user_id=auth.uid());

create or replace function public.ensure_profile() returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare u auth.users; anonymous boolean; name text;
begin select * into u from auth.users where id=auth.uid(); if u.id is null then raise exception 'Authentication required'; end if;
 anonymous := coalesce((u.raw_app_meta_data->>'is_anonymous')::boolean,false); if anonymous then raise exception 'Anonymous sessions cannot post as an account'; end if;
 name := left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),nullif(btrim(u.raw_user_meta_data->>'name'),''),'Doku-Doujin member'),80);
 insert into public.profiles(user_id,display_name,avatar_url) values(u.id,name,case when coalesce(u.raw_user_meta_data->>'avatar_url','') ~ '^https://' then u.raw_user_meta_data->>'avatar_url' end) on conflict(user_id) do nothing; return u.id;
end$$;

create or replace function public.create_comment(p_work_id text,p_body text,p_display_mode public.comment_display_mode,p_parent_id uuid default null) returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare uid uuid:=auth.uid(); cid uuid; parent public.comments; profile uuid;
begin if uid is null then raise exception 'Authentication required'; end if; if char_length(btrim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Comment must contain 1 to 2000 characters'; end if;
 if p_work_id is null or char_length(p_work_id) not between 1 and 128 then raise exception 'Invalid work'; end if;
 if exists(select 1 from public.comment_authorship a join public.comments c on c.id=a.comment_id where a.user_id=uid and c.created_at > now()-interval '15 seconds') then raise exception 'Please wait 15 seconds before posting again'; end if;
 if p_parent_id is not null then select * into parent from public.comments where id=p_parent_id for share; if not found or parent.deleted_at is not null then raise exception 'Reply target unavailable'; end if; if parent.work_id<>p_work_id then raise exception 'Reply belongs to another work'; end if; if parent.parent_id is not null then raise exception 'Replies may only be one level deep'; end if; end if;
 if p_display_mode='account' then profile:=public.ensure_profile(); elsif p_display_mode='anonymous' then profile:=null; else raise exception 'Unsupported display mode'; end if;
 insert into public.comments(work_id,parent_id,display_mode,public_profile_id,body) values(p_work_id,p_parent_id,p_display_mode,profile,btrim(p_body)) returning id into cid;
 insert into public.comment_authorship(comment_id,user_id) values(cid,uid); return cid;
end$$;
create or replace function public.edit_own_comment(p_comment_id uuid,p_body text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$ begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if char_length(btrim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'Comment must contain 1 to 2000 characters'; end if;
 update public.comments c set body=btrim(p_body),edited_at=now() where c.id=p_comment_id and c.deleted_at is null and exists(select 1 from public.comment_authorship a where a.comment_id=c.id and a.user_id=auth.uid()); if not found then raise exception 'Comment unavailable or not owned'; end if; end$$;
create or replace function public.delete_own_comment(p_comment_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$ begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; update public.comments c set deleted_at=now() where c.id=p_comment_id and c.deleted_at is null and exists(select 1 from public.comment_authorship a where a.comment_id=c.id and a.user_id=auth.uid()); if not found then raise exception 'Comment unavailable or not owned'; end if; end$$;
create or replace function public.vote_comment(p_comment_id uuid,p_value smallint) returns void language plpgsql security definer set search_path=pg_catalog,public as $$ begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if p_value not in(-1,1) then raise exception 'Invalid vote'; end if; if not exists(select 1 from public.comments where id=p_comment_id and deleted_at is null) then raise exception 'Comment unavailable'; end if;
 insert into public.comment_votes values(p_comment_id,auth.uid(),p_value,now()); exception when unique_violation then raise exception 'You have already voted'; end$$;
create or replace function public.report_comment(p_comment_id uuid,p_reason text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$ begin
 if auth.uid() is null then raise exception 'Authentication required'; end if; if p_reason not in('spam','harassment','other') then raise exception 'Invalid report reason'; end if; if not exists(select 1 from public.comments where id=p_comment_id and deleted_at is null) then raise exception 'Comment unavailable'; end if;
 insert into public.comment_reports values(p_comment_id,auth.uid(),p_reason,now()); exception when unique_violation then raise exception 'You have already reported this comment'; end$$;

create or replace function public.get_work_discussion(p_work_id text,p_before_created_at timestamptz default null,p_before_id uuid default null,p_limit integer default 30) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
with tops as (select c.* from public.comments c where c.work_id=p_work_id and c.parent_id is null and (p_before_created_at is null or (c.created_at,c.id)<(p_before_created_at,p_before_id)) order by c.created_at desc,c.id desc limit least(greatest(p_limit,1),30)), shaped as (
 select t.*,p.display_name,exists(select 1 from public.comment_authorship a where a.comment_id=t.id and a.user_id=auth.uid()) is_author,coalesce((select sum(v.value) from public.comment_votes v where v.comment_id=t.id),0) score,
 coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'work_id',r.work_id,'parent_id',r.parent_id,'display_mode',r.display_mode,'display_name',rp.display_name,'body',r.body,'created_at',r.created_at,'edited_at',r.edited_at,'deleted_at',r.deleted_at,'score',coalesce((select sum(rv.value) from public.comment_votes rv where rv.comment_id=r.id),0),'is_author',exists(select 1 from public.comment_authorship ra where ra.comment_id=r.id and ra.user_id=auth.uid())) order by r.created_at,r.id) from public.comments r left join public.profiles rp on rp.user_id=r.public_profile_id where r.parent_id=t.id),'[]'::jsonb) replies
 from tops t left join public.profiles p on p.user_id=t.public_profile_id)
select jsonb_build_object('comments',coalesce(jsonb_agg(jsonb_build_object('id',id,'work_id',work_id,'parent_id',parent_id,'display_mode',display_mode,'display_name',display_name,'body',body,'created_at',created_at,'edited_at',edited_at,'deleted_at',deleted_at,'score',score,'is_author',is_author,'replies',replies) order by created_at desc,id desc),'[]'::jsonb),'nextCursor',case when count(*)=least(greatest(p_limit,1),30) then jsonb_build_object('created_at',min(created_at),'id',(array_agg(id order by created_at,id))[1]) else null end) from shaped;
$$;

revoke all on public.comment_authorship,public.comment_votes,public.comment_reports from anon,authenticated;
revoke all on function public.ensure_profile(),public.create_comment(text,text,public.comment_display_mode,uuid),public.edit_own_comment(uuid,text),public.delete_own_comment(uuid),public.vote_comment(uuid,smallint),public.report_comment(uuid,text),public.get_work_discussion(text,timestamptz,uuid,integer) from public;
grant execute on function public.get_work_discussion(text,timestamptz,uuid,integer) to anon,authenticated;
grant execute on function public.create_comment(text,text,public.comment_display_mode,uuid),public.edit_own_comment(uuid,text),public.delete_own_comment(uuid),public.vote_comment(uuid,smallint),public.report_comment(uuid,text) to authenticated;
grant select on public.comments,public.profiles to anon,authenticated; grant select,insert,delete on public.bookmarks to authenticated;
