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

-- ESPEJO · registro de análisis (2026-09-26)
-- Resultados siempre, anónimos (sin correo ni foto). Correo y foto sólo con
-- la casilla de consentimiento; la foto se borra a los 30 días (worker.js).
-- El Worker crea la tabla al primer uso si no existe.
CREATE TABLE IF NOT EXISTS analisis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creado TEXT NOT NULL,
  sesion TEXT, idioma TEXT, modo TEXT,
  codigo TEXT, tono TEXT, ita REAL, patron TEXT, confianza INTEGER,
  datos TEXT NOT NULL,
  email TEXT,
  foto TEXT
);
