-- No-tox felhasználói séma (PostgreSQL 16)
-- ============================================================================
-- Több-felhasználós, ZÁRT KÖR (admin-jóváhagyás) + per-user adat.
-- A frontend objektumok (field/location/model) JSONB-ben tárolódnak, a
-- tulajdonos (user_id) és a listázandó kulcs (name) kiemelve a hatékony
-- lekérdezéshez. Így a frontend objektum-szerkezet változhat séma-migráció
-- nélkül, és a localStorage→API átállás súrlódásmentes.
--
-- gen_random_uuid() a PostgreSQL 13+ core-ban elérhető (nem kell extension).
-- ============================================================================

-- Felhasználók — zárt kör: regisztráció 'pending', admin teszi 'approved'-ra.
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                 -- bcrypt/argon2 hash — SOHA plain jelszó
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','disabled')),
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    role            TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user','admin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Táblaelemző parcellák (a frontend field-objektum: polygon, crop, lat/lon…).
CREATE TABLE IF NOT EXISTS fields (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dashboard helyszín-widgetek (lat, lon, modelId, wxModel…).
CREATE TABLE IF NOT EXISTS locations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Egyéni betegségmodellek (a frontend model-objektum: params…).
CREATE TABLE IF NOT EXISTS models (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email-megerősítő és jelszó-visszaállító tokenek.
-- Éles használatban a token HASH-elt értékét tároljuk (mint a jelszót),
-- hogy DB-szivárgás esetén ne legyen visszaélésre alkalmas.
CREATE TABLE IF NOT EXISTS tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL CHECK (type IN ('email_verify','password_reset')),
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexek: "adott felhasználó összes rekordja" gyakori lekérdezés.
CREATE INDEX IF NOT EXISTS idx_fields_user    ON fields(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_user ON locations(user_id);
CREATE INDEX IF NOT EXISTS idx_models_user    ON models(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_user    ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);
