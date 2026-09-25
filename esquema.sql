-- ESPEJO · altas de correo
-- Sólo datos de contacto. Ningún índice ni resultado del análisis se guarda
-- aquí: eso sería dato de salud a efectos del RGPD.
CREATE TABLE IF NOT EXISTS leads (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL,
  idioma         TEXT,
  consentimiento INTEGER NOT NULL DEFAULT 0,
  sesion         TEXT,
  creado         TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_email ON leads(email);
