#!/usr/bin/env node
/**
 * UVM FabLab — Bulk User Importer
 * ─────────────────────────────────────────────────────────────────
 * Reads net IDs from an Excel file and inserts them into the
 * FabLab scheduler database with:
 *   • PIN:  0323  (hashed with bcrypt)
 *   • Role: user  (change DEFAULT_ROLE below if needed)
 *   • Force PIN reset flagged — users must set their own PIN on
 *     first login
 *
 * Usage:
 *   node bulk-import-users.js <path-to-excel-file.xlsx>
 *
 * Examples:
 *   node bulk-import-users.js students.xlsx
 *   node bulk-import-users.js ~/Downloads/cs101-roster.xlsx
 *
 * Excel format (any of these work — script auto-detects):
 *   ┌──────────┐   ┌──────────┬──────────┐   ┌────────────────────────┐
 *   │  NetID   │   │  Name    │  NetID   │   │  jsmith  (no header)   │
 *   │  jsmith  │   │  Jane    │  jsmith  │   │  adoe                  │
 *   │  adoe    │   │  Alice   │  adoe    │   └────────────────────────┘
 *   └──────────┘   └──────────┴──────────┘
 *
 * Requirements (already in your project):
 *   npm install xlsx bcrypt better-sqlite3
 *   (xlsx may need installing: npm install xlsx)
 * ─────────────────────────────────────────────────────────────────
 */

const path     = require('path');
const fs       = require('fs');
const XLSX     = require('xlsx');
const bcrypt   = require('bcrypt');
const Database = require('better-sqlite3');

// ── CONFIG ────────────────────────────────────────────────────────
const DEFAULT_PIN    = '0323';
const DEFAULT_ROLE   = 'user';       // 'user' | 'admin' | 'read'
const BCRYPT_ROUNDS  = 10;

// Path to your existing database — adjust if your folder structure differs
const DB_PATH = path.join(__dirname, 'data', 'bookings.db');
// ─────────────────────────────────────────────────────────────────

// ── ARG CHECK ─────────────────────────────────────────────────────
const xlsxPath = process.argv[2];
if (!xlsxPath) {
    console.error('\n  ✗ No file provided.\n');
    console.error('  Usage: node bulk-import-users.js <path-to-file.xlsx>\n');
    process.exit(1);
}
const resolvedPath = path.resolve(xlsxPath);
if (!fs.existsSync(resolvedPath)) {
    console.error(`\n  ✗ File not found: ${resolvedPath}\n`);
    process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
    console.error(`\n  ✗ Database not found at: ${DB_PATH}`);
    console.error('  Make sure you run this script from your project root folder.\n');
    process.exit(1);
}

// ── READ EXCEL ────────────────────────────────────────────────────
console.log(`\n  Reading: ${resolvedPath}`);
const workbook  = XLSX.readFile(resolvedPath);
const sheetName = workbook.SheetNames[0];
const sheet     = workbook.Sheets[sheetName];

// Convert to array of arrays (raw, so we can handle header-less sheets too)
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

if (rows.length === 0) {
    console.error('  ✗ Sheet appears to be empty.\n');
    process.exit(1);
}

// ── FIND THE NET ID COLUMN ────────────────────────────────────────
// Look for a header row containing a recognisable column name.
// If none is found, assume the first column is the net ID column.
const NET_ID_HEADERS = ['netid', 'net id', 'net_id', 'username',
                        'user', 'userid', 'user id', 'login', 'id'];

let dataStartRow = 0;   // index of first data row
let netIdColIdx  = 0;   // column index of net ID

const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
const headerMatch = firstRow.findIndex(h => NET_ID_HEADERS.includes(h));

if (headerMatch !== -1) {
    // Found a recognisable header
    netIdColIdx  = headerMatch;
    dataStartRow = 1;
    console.log(`  Detected header row. Using column "${rows[0][netIdColIdx]}" for net IDs.`);
} else {
    // No header — treat first column as net IDs (skip if it looks like a header word)
    netIdColIdx  = 0;
    dataStartRow = 0;
    console.log('  No header row detected. Using column A as net IDs.');
}

// ── COLLECT NET IDs ───────────────────────────────────────────────
const rawNetIds = rows
    .slice(dataStartRow)
    .map(row => String(row[netIdColIdx] || '').trim().toLowerCase())
    .filter(id => id.length > 0);

if (rawNetIds.length === 0) {
    console.error('  ✗ No net IDs found in that column.\n');
    process.exit(1);
}

console.log(`  Found ${rawNetIds.length} net ID(s) to import.\n`);

// ── IMPORT ────────────────────────────────────────────────────────
const db = new Database(DB_PATH);

// Hash the shared default PIN once (same salt rounds as server.js)
console.log(`  Hashing PIN "${DEFAULT_PIN}" (this takes a moment)…`);
const pinHash = bcrypt.hashSync(DEFAULT_PIN, BCRYPT_ROUNDS);

const insert = db.prepare(`
    INSERT INTO users (name, email, pin_hash, role, force_pin_change)
    VALUES (?, NULL, ?, ?, 1)
`);
const checkExists = db.prepare(`SELECT id FROM users WHERE LOWER(name) = ?`);

const importMany = db.transaction((ids) => {
    let added = 0, skipped = 0;
    const skippedList = [];

    for (const netId of ids) {
        const existing = checkExists.get(netId);
        if (existing) {
            skipped++;
            skippedList.push(netId);
            continue;
        }
        insert.run(netId, pinHash, DEFAULT_ROLE);
        added++;
    }
    return { added, skipped, skippedList };
});

const { added, skipped, skippedList } = importMany(rawNetIds);

// ── RESULTS ───────────────────────────────────────────────────────
console.log('  ─────────────────────────────────────');
console.log(`  ✓ Imported:  ${added} user(s)`);
if (skipped > 0) {
    console.log(`  ⚠ Skipped:   ${skipped} already existed`);
    console.log(`    (${skippedList.join(', ')})`);
}
console.log('  ─────────────────────────────────────');
console.log('');
console.log('  All imported users:');
console.log(`    • PIN:              ${DEFAULT_PIN}`);
console.log(`    • Role:             ${DEFAULT_ROLE}`);
console.log(`    • Force PIN reset:  YES — prompted on first login`);
console.log('');
console.log('  Done.\n');
