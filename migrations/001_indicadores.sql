CREATE TABLE IF NOT EXISTS indicadores (
  ano           integer NOT NULL,
  mes           integer NOT NULL,
  equipa        text    NOT NULL,
  certificacoes integer,
  consultores   integer,
  PRIMARY KEY (ano, mes, equipa)
);

ALTER TABLE indicadores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'indicadores' AND policyname = 'indicadores_anon_read') THEN
    CREATE POLICY indicadores_anon_read ON indicadores FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'indicadores' AND policyname = 'indicadores_anon_write') THEN
    CREATE POLICY indicadores_anon_write ON indicadores FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO indicadores (ano, mes, equipa, certificacoes, consultores) VALUES
  (2025,  1, 'SAP Tecnology', 104,  70),
  (2025,  2, 'SAP Tecnology', 110,  74),
  (2025,  3, 'SAP Tecnology', 115,  77),
  (2025,  4, 'SAP Tecnology', 116,  77),
  (2025,  5, 'SAP Tecnology', 117,  78),
  (2025,  6, 'SAP Tecnology', 117,  78),
  (2025,  7, 'SAP Tecnology', 121,  82),
  (2025,  8, 'SAP Tecnology', 126,  86),
  (2025,  9, 'SAP Tecnology', 128,  85),
  (2025, 10, 'SAP Tecnology', 131,  86),
  (2025, 11, 'SAP Tecnology', 141,  92),
  (2025, 12, 'SAP Tecnology', 262, 131),
  (2026,  1, 'SAP Tecnology', 275, 133),
  (2026,  2, 'SAP Tecnology', 277, 136),
  (2026,  3, 'SAP Tecnology', 290, 136),
  (2026,  4, 'SAP Tecnology', 319, 135)
ON CONFLICT (ano, mes, equipa) DO UPDATE SET
  certificacoes = EXCLUDED.certificacoes,
  consultores   = EXCLUDED.consultores;
