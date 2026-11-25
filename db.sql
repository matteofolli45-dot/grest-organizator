-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
  sabato_oratorio USER-DEFINED DEFAULT 'no'::opzione_si_no,
  CONSTRAINT animatori_pkey PRIMARY KEY (id_animatore),
  CONSTRAINT animatori_squadra_fkey FOREIGN KEY (squadra) REFERENCES public.squadre(id_squadra)
);
CREATE TABLE public.status_bimbi (
  id_status integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_bambino integer NOT NULL UNIQUE,
  stellina USER-DEFINED,
  nuoto USER-DEFINED,
  allergie boolean NOT NULL DEFAULT false,
  allergie_dettagli text,
  problematica text,
  istruzioni text,
  dettagli character varying,
  CONSTRAINT status_bimbi_pkey PRIMARY KEY (id_status),
  CONSTRAINT status_bimbi_id_bambino_fkey FOREIGN KEY (id_bambino) REFERENCES public.bambini(id_bambini)
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
CREATE TABLE public.avvisi_sabor (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  testo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  autore text NOT NULL CHECK (autore = ANY (ARRAY['Animatore'::text, 'Catechista'::text, 'Admin'::text])),
  CONSTRAINT avvisi_sabor_pkey PRIMARY KEY (id)
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
CREATE TABLE public.sabor_iscritti (
  id_iscritto integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome character varying NOT NULL,
  cognome character varying NOT NULL,
  id_bambino_grest integer,
  note text,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sabor_iscritti_pkey PRIMARY KEY (id_iscritto),
  CONSTRAINT sabor_iscritti_id_bambino_grest_fkey FOREIGN KEY (id_bambino_grest) REFERENCES public.bambini(id_bambini)
);
CREATE TABLE public.sabor_incontri (
  id_incontro integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  data date NOT NULL UNIQUE,
  titolo_attivita text NOT NULL,
  descrizione text,
  tipo_responsabile text CHECK (tipo_responsabile = ANY (ARRAY['animatore'::text, 'catechista'::text])),
  id_animatore_responsabile integer,
  responsabili_animatori integer[] NOT NULL DEFAULT '{}'::integer[],
  nome_responsabile text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  numero_bambini integer NOT NULL DEFAULT 0,
  bambini_classe_1 integer NOT NULL DEFAULT 0,
  bambini_classe_2 integer NOT NULL DEFAULT 0,
  bambini_classe_3 integer NOT NULL DEFAULT 0,
  bambini_classe_4 integer NOT NULL DEFAULT 0,
  bambini_classe_5 integer NOT NULL DEFAULT 0,
  numero_celiaci integer NOT NULL DEFAULT 0,
  numero_intolleranti integer NOT NULL DEFAULT 0,
  intolleranze text,
  problematiche_merenda text,
  merende ARRAY NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT sabor_incontri_pkey PRIMARY KEY (id_incontro),
  CONSTRAINT sabor_incontri_id_animatore_responsabile_fkey FOREIGN KEY (id_animatore_responsabile) REFERENCES public.animatori(id_animatore)
);
CREATE TABLE public.sabor_presenze (
  id_presenza integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_incontro integer NOT NULL,
  id_iscritto integer NOT NULL,
  presente boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sabor_presenze_pkey PRIMARY KEY (id_presenza),
  CONSTRAINT sabor_presenze_id_incontro_fkey FOREIGN KEY (id_incontro) REFERENCES public.sabor_incontri(id_incontro),
  CONSTRAINT sabor_presenze_id_iscritto_fkey FOREIGN KEY (id_iscritto) REFERENCES public.sabor_iscritti(id_iscritto)
);
ALTER TABLE public.sabor_incontri
  ALTER COLUMN merende TYPE text[] USING COALESCE(merende, ARRAY[]::text[]);

-- Lista centrale delle iscrizioni dei bambini, da approvare prima dell'inserimento in public.bambini
CREATE TABLE IF NOT EXISTS public.iscrizioni_grest (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  nome character varying NOT NULL,
  cognome character varying NOT NULL,
  classe integer NOT NULL CHECK (classe BETWEEN 1 AND 5),
  sa_nuotare boolean NOT NULL DEFAULT false,
  allergie boolean NOT NULL DEFAULT false,
  allergie_dettagli text,
  problemi text,
  stato text NOT NULL DEFAULT 'in_attesa'
    CHECK (stato = ANY (ARRAY['in_attesa'::text, 'importata'::text, 'ignorata_duplicata'::text, 'rifiutata'::text, 'errore'::text])),
  CONSTRAINT iscrizioni_grest_pkey PRIMARY KEY (id)
);

ALTER TABLE public.iscrizioni_grest
  DROP CONSTRAINT IF EXISTS iscrizioni_grest_stato_check;
ALTER TABLE public.iscrizioni_grest
  ADD CONSTRAINT iscrizioni_grest_stato_check
  CHECK (stato = ANY (ARRAY['in_attesa'::text, 'importata'::text, 'ignorata_duplicata'::text, 'rifiutata'::text, 'errore'::text]));

ALTER TABLE public.iscrizioni_grest ENABLE ROW LEVEL SECURITY;

-- Il modulo pubblico può solo inserire nuove richieste.
DROP POLICY IF EXISTS "Registrazioni pubbliche: inserimento" ON public.iscrizioni_grest;
CREATE POLICY "Iscrizioni pubbliche: inserimento" ON public.iscrizioni_grest
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Gestione delle richieste: inserimento, lettura e aggiornamento.
-- Nota: finché l'admin usa la password lato client, i dati restano accessibili con la chiave anon.
DROP POLICY IF EXISTS "Registrazioni amministrative: gestione" ON public.iscrizioni_grest;
CREATE POLICY "Iscrizioni amministrative: gestione" ON public.iscrizioni_grest
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Registrazione bambini: dati sanitari aggiuntivi
ALTER TABLE public.status_bimbi
  ADD COLUMN IF NOT EXISTS allergie boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allergie_dettagli text,
  ADD COLUMN IF NOT EXISTS problematica text,
  ADD COLUMN IF NOT EXISTS istruzioni text;