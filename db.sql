
CREATE TABLE public.squadre (
  id_squadra integer NOT NULL DEFAULT nextval('squadre_id_squadra_seq'::regclass),
  numero_membri_tot integer NOT NULL DEFAULT 0,
  punteggio integer,
  piscina USER-DEFINED,
  nome USER-DEFINED UNIQUE,
  CONSTRAINT squadre_pkey PRIMARY KEY (id_squadra)
);
CREATE TABLE public.presenze (
  id_presenza integer NOT NULL DEFAULT nextval('presenze_id_presenza_seq'::regclass),
  id_animatore integer,
  id_bambino integer,
  data date NOT NULL,
  pranzo USER-DEFINED NOT NULL DEFAULT 'no'::opzione_si_no,
  riconsegna text,
  ora_arrivo time without time zone,
  CONSTRAINT presenze_pkey PRIMARY KEY (id_presenza),
  CONSTRAINT presenze_id_animatore_fkey FOREIGN KEY (id_animatore) REFERENCES public.animatori(id_animatore)
);
CREATE TABLE public.animatori (
  id_animatore integer NOT NULL DEFAULT nextval('animatori_id_animatore_seq'::regclass),
  nome character varying NOT NULL,
  cognome character varying NOT NULL,
  ruolo USER-DEFINED NOT NULL,
  settimana ARRAY DEFAULT '{}'::n_settimana[],
  squadra integer,
  nominativo text DEFAULT (((nome)::text || ' '::text) || (cognome)::text),
  Password text DEFAULT substr((gen_random_uuid())::text, 1, 8),
  CONSTRAINT animatori_pkey PRIMARY KEY (id_animatore),
  CONSTRAINT animatori_squadra_fkey FOREIGN KEY (squadra) REFERENCES public.squadre(id_squadra)
);
CREATE TABLE public.status_bimbi (
  id_status integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_bambino integer NOT NULL UNIQUE,
  stellina USER-DEFINED,
  nuoto USER-DEFINED,
  dettagli character varying,
  CONSTRAINT status_bimbi_pkey PRIMARY KEY (id_status)
);
CREATE TABLE public.programmazione (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  data_attivita text,
  settimana_index integer,
  giorno_index integer,
  fascia text,
  nome_attivita text,
  CONSTRAINT programmazione_pkey PRIMARY KEY (id)
);
CREATE TABLE public.avvisi (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  testo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  autore text DEFAULT 'Anonimo'::text,
  CONSTRAINT avvisi_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bambini (
  id_bambini integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome character varying NOT NULL,
  cognome character varying,
  classe USER-DEFINED,
  squadra integer,
  settimana ARRAY,
  CONSTRAINT bambini_pkey PRIMARY KEY (id_bambini),
  CONSTRAINT bambini_squadra_fkey FOREIGN KEY (squadra) REFERENCES public.squadre(id_squadra)
);
-- ==========================================
-- SABATO ORATORIO — nuove tabelle (prefisso sabor_)
-- ==========================================

-- Roster dei ragazzi: possono essere già in "bambini" (GREST) 
-- oppure iscrizioni nuove solo per il sabato.
create table public.sabor_iscritti (
    id_iscritto integer generated always as identity primary key,
    nome varchar not null,
    cognome varchar not null,
    id_bambino_grest int4 references public.bambini(id_bambini) on delete set null,
    note text,                      -- opzionale: allergie, avvisi vari
    attivo boolean not null default true,
    created_at timestamptz not null default now()
);

-- Un sabato = un'attività specifica, gestita da un animatore o da un catechista.
create table public.sabor_incontri (
    id_incontro integer generated always as identity primary key,
    data date not null unique,      -- un solo incontro per sabato
    titolo_attivita text not null,
    descrizione text,
    tipo_responsabile text check (tipo_responsabile in ('animatore', 'catechista')),
    id_animatore_responsabile int4 references public.animatori(id_animatore) on delete set null,
    nome_responsabile text,         -- usato quando il responsabile è un catechista (non è nella tabella animatori)
    created_at timestamptz not null default now()
);

-- Presenza: solo sì/no per ogni ragazzo ad ogni incontro.
create table public.sabor_presenze (
    id_presenza integer generated always as identity primary key,
    id_incontro integer not null references public.sabor_incontri(id_incontro) on delete cascade,
    id_iscritto integer not null references public.sabor_iscritti(id_iscritto) on delete cascade,
    presente boolean not null default true,
    created_at timestamptz not null default now(),
    unique (id_incontro, id_iscritto)
);

-- ==========================================
-- RLS — stessa impostazione delle altre tabelle (lettura/scrittura via anon key)
-- ==========================================
alter table public.sabor_iscritti enable row level security;
alter table public.sabor_incontri enable row level security;
alter table public.sabor_presenze enable row level security;

create policy "Accesso sabor_iscritti" on public.sabor_iscritti for all using (true) with check (true);
create policy "Accesso sabor_incontri" on public.sabor_incontri for all using (true) with check (true);
create policy "Accesso sabor_presenze" on public.sabor_presenze for all using (true) with check (true);