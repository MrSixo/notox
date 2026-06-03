// Jelszó-hash, JWT és token-segédfüggvények.
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const BCRYPT_COST = 12; // ~250ms/hash — egyensúly biztonság és sebesség közt
const JWT_EXPIRY = "7d"; // session élettartam

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Email-megerősítő / jelszó-reset token: 256 bit véletlen.
function genToken() {
  return crypto.randomBytes(32).toString("hex");
}

// JWT aláírás/ellenőrzés a session-höz. A JWT_SECRET az app settingsből jön.
function signJwt(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}
function verifyJwt(token) {
  return jwt.verify(token, process.env.JWT_SECRET); // hibát dob, ha érvénytelen/lejárt
}

module.exports = { hashPassword, verifyPassword, genToken, signJwt, verifyJwt };
