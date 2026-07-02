// PostgreSQL kapcsolat-pool — egyetlen pool az egész Function App-ra.
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

let pool;

// Azure Postgres kötelező TLS. Teljes CA-validáció a csomagolt gyökér-CA-kkal
// (DigiCert Global Root G2 + Microsoft RSA Root 2017). Ha a cert bármiért nem
// olvasható, biztonságos visszaesés titkosított-de-nem-validált módra (az app
// nem áll le egy hiányzó fájl miatt).
function sslConfig() {
  try {
    const ca = fs.readFileSync(path.join(__dirname, "..", "certs", "azure-postgres-ca.pem"), "utf8");
    return { ca, rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: false };
  }
}

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
      ssl: sslConfig(),
      max: 4,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

module.exports = { getPool };
