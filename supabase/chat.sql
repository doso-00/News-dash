-- Cinque al Mattino: discussione dentro ogni notizia.
-- Da incollare in Supabase → SQL Editor → New query, poi Run. Si può rilanciare senza danni.
-- Richiede che supabase/schema.sql sia già stato eseguito.
--
-- Come funziona: ogni notizia è una stanza, identificata dall'id della scheda (es. 2026-10-24-ai).
-- I messaggi si leggono con una select e si scrivono SOLO tramite le funzioni qui sotto, che
-- controllano lunghezza, utente e frequenza. Chi scrive è identificato dal solo username, come nel
-- resto dell'app: tra amici va bene, ma qualcuno potrebbe scrivere a nome di un altro.

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  card_id    text not null check (card_id ~ '^\d{4}-\d{2}-\d{2}-[a-z0-9-]{2,40}$'),
  username   text not null references public.players(username) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  secret_hash text not null,                 -- permette di cancellare il proprio messaggio dallo stesso dispositivo
  sender     text,                           -- impronta della rete di chi scrive, solo per limitare lo spam
  reports    int not null default 0,         -- con 2 segnalazioni il messaggio sparisce dalla vista
  created_at timestamptz not null default now()
);

create index if not exists messages_card_idx on public.messages (card_id, id);
create index if not exists messages_created_idx on public.messages (created_at);

create table if not exists public.message_reports (
  message_id bigint not null references public.messages(id) on delete cascade,
  reporter   text not null references public.players(username) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, reporter)
);

alter table public.messages enable row level security;
alter table public.message_reports enable row level security;

drop policy if exists "messages are readable" on public.messages;
create policy "messages are readable" on public.messages
  for select to anon, authenticated using (true);

-- Nessun accesso diretto in scrittura: solo le funzioni. Si leggono solo le colonne pubbliche.
revoke all on public.messages from anon, authenticated;
revoke all on public.message_reports from anon, authenticated;
grant select (id, card_id, username, body, created_at, reports) on public.messages to anon, authenticated;

-- Scrive un messaggio. Limiti: 500 caratteri, 6 messaggi al minuto per persona, 20 per rete.
create or replace function public.post_message(p_card text, p_user text, p_body text, p_secret text)
returns table (msg_id bigint, msg_created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_body   text := btrim(coalesce(p_body, ''));
  v_sender text;
  v_user   int;
  v_net    int;
begin
  if p_card is null or p_card !~ '^\d{4}-\d{2}-\d{2}-[a-z0-9-]{2,40}$' then
    raise exception 'Scheda non valida.' using errcode = '22023';
  end if;
  if char_length(v_body) not between 1 and 500 then
    raise exception 'Il messaggio deve avere da 1 a 500 caratteri.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_secret, '')) < 16 then
    raise exception 'Dispositivo non riconosciuto: ricarica l''app.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.players pl where pl.username = p_user) then
    raise exception 'Utente sconosciuto.' using errcode = '22023';
  end if;

  begin
    v_sender := nullif(md5(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '')), md5(''));
  exception when others then
    v_sender := null;
  end;

  select count(*) into v_user from public.messages m
    where m.username = p_user and m.created_at > now() - interval '1 minute';
  if v_user >= 6 then
    raise exception 'Troppi messaggi: aspetta un minuto.' using errcode = 'P0001';
  end if;
  if v_sender is not null then
    select count(*) into v_net from public.messages m
      where m.sender = v_sender and m.created_at > now() - interval '1 minute';
    if v_net >= 20 then
      raise exception 'Troppi messaggi da questa rete: aspetta un minuto.' using errcode = 'P0001';
    end if;
  end if;
  if exists (
    select 1 from public.messages m
    where m.username = p_user and m.card_id = p_card and m.body = v_body
      and m.created_at > now() - interval '5 minutes'
  ) then
    raise exception 'Hai già inviato questo messaggio.' using errcode = 'P0001';
  end if;

  return query
    insert into public.messages (card_id, username, body, secret_hash, sender)
    values (p_card, p_user, v_body, encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'), v_sender)
    returning messages.id, messages.created_at;
end $$;

-- Cancella un proprio messaggio: serve il codice del dispositivo da cui è stato scritto.
create or replace function public.delete_message(p_id bigint, p_secret text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.messages m
   where m.id = p_id
     and m.secret_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex');
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Segnala un messaggio di un altro: con 2 segnalazioni di persone diverse sparisce dalla vista.
create or replace function public.report_message(p_id bigint, p_reporter text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.players pl where pl.username = p_reporter) then
    raise exception 'Utente sconosciuto.' using errcode = '22023';
  end if;
  if exists (select 1 from public.messages m where m.id = p_id and m.username = p_reporter) then
    raise exception 'Non puoi segnalare un tuo messaggio.' using errcode = '22023';
  end if;
  insert into public.message_reports (message_id, reporter) values (p_id, p_reporter) on conflict do nothing;
  update public.messages m
     set reports = (select count(*) from public.message_reports r where r.message_id = m.id)
   where m.id = p_id;
end $$;

-- Per ogni scheda: quante persone ce l'hanno, quanti messaggi, id dell'ultimo.
create or replace function public.rooms(p_cards text[])
returns table (card_id text, people int, messages int, last_id bigint)
language sql stable security definer set search_path = public as $$
  select c.card_id,
         (select count(*)::int from public.players pl where jsonb_exists(pl.stats -> 'cards', c.card_id)),
         (select count(*)::int from public.messages m where m.card_id = c.card_id and m.reports < 2),
         (select max(m.id) from public.messages m where m.card_id = c.card_id and m.reports < 2)
  from unnest((p_cards)[1:12]) as c(card_id)
$$;

-- Toglie i messaggi più vecchi di 30 giorni. L'app la chiama ogni notte.
create or replace function public.purge_old_messages()
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.messages m where m.created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.post_message(text, text, text, text) from public;
revoke execute on function public.delete_message(bigint, text) from public;
revoke execute on function public.report_message(bigint, text) from public;
revoke execute on function public.rooms(text[]) from public;
revoke execute on function public.purge_old_messages() from public;
grant execute on function public.post_message(text, text, text, text) to anon, authenticated;
grant execute on function public.delete_message(bigint, text) to anon, authenticated;
grant execute on function public.report_message(bigint, text) to anon, authenticated;
grant execute on function public.rooms(text[]) to anon, authenticated;
grant execute on function public.purge_old_messages() to anon, authenticated;
