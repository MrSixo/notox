// PostgreSQL kapcsolat-pool — egyetlen pool az egész Function App-ra.
const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    // Külön PG* változók (nem connection-string URL), hogy a jelszó speciális
    // karakterei ne igényeljenek URL-encoding-ot.
    pool = new Pool({
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: Number(process.env.PGPORT || 5432),
      // Azure Postgres kötelező TLS. Éles használatban CA-validáció ajánlott
      // (DigiCert Global Root) a rejectUnauthorized:false helyett.
      ssl: { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

module.exports = { getPool };
