// Payment reconciliation.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = dirname(fileURLToPath(import.meta.url));
const PAYMENTS_FILE = join(baseDir, "payments.jsonl");
const EXPECTED_FILE = join(baseDir, "expected.txt");

const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

const parseTimestamp = (ts) => {
  const invalid = { valid: false };

  if (typeof ts === "number") {
    if (!Number.isFinite(ts)) return invalid;
    return { valid: true, value: ts < 1e12 ? ts * 1000 : ts };
  }
  if (typeof ts !== "string" || ts.trim() === "") return invalid;

  const text = ts.trim();
  if (/^\d+$/.test(text)) return parseTimestamp(Number(text));

  const iso = text.replace(" ", "T");
  const value = Date.parse(HAS_TIMEZONE.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(value) ? invalid : { valid: true, value };
};

const toKobo = (amount) => {
  const naira =
    typeof amount === "number" ? amount : Number(String(amount).replace(/,/g, "").trim());
  return Number.isFinite(naira) ? Math.round(naira * 100) : 0;
};

const parseLine = (line) => {
  try {
    const event = JSON.parse(line);
    return event && typeof event === "object" ? event : null;
  } catch {
    return null;
  }
};

const hasTxnId = (event) =>
  event.txn_id !== undefined && event.txn_id !== null && String(event.txn_id).trim() !== "";

const latestByTxn = new Map();

for (const line of readFileSync(PAYMENTS_FILE, "utf8").split(/\r?\n/)) {
  if (!line.trim()) continue;

  const event = parseLine(line);
  if (!event || !hasTxnId(event)) continue;

  const id = String(event.txn_id).trim();
  const time = parseTimestamp(event.ts);
  const current = latestByTxn.get(id);

  if (!current || (time.valid && (!current.time.valid || time.value >= current.time.value))) {
    latestByTxn.set(id, { event, time });
  }
}

let totalKobo = 0;
let count = 0;

for (const { event } of latestByTxn.values()) {
  if (String(event.status).trim().toLowerCase() === "success") {
    totalKobo += toKobo(event.amount);
    count += 1;
  }
}

const expected = parseInt(readFileSync(EXPECTED_FILE, "utf8").trim(), 10);

if (count !== expected) {
  console.log(`Check failed: counted ${count} successful payments, expected ${expected}.`);
  console.log("Something in the data isn't being handled the way the README describes.");
} else {
  console.log(`Check passed: ${count} successful payments.`);
  console.log(`Your code: KOYA-${Math.round(totalKobo / 100)}`);
}