import { describe, expect, it } from 'vitest';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { DmmImportError, extractArrDatabase, readZipEntries } from './dmmWantedImport.js';

/** Smallest valid single-entry zip: [local header][name][data][central dir][EOCD]. */
function makeZip(name: string, data: Buffer, method: 0 | 8): Buffer {
  const fileName = Buffer.from(name, 'utf8');
  const stored = method === 8 ? data : data;
  const uncompressed = method === 0 ? stored : inflateRawSync(stored);
  const crc = 0; // The reader never checks CRC — DMM re-inflates and validates the database itself.

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(stored.length, 18);
  local.writeUInt32LE(uncompressed.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(stored.length, 20);
  central.writeUInt32LE(uncompressed.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + fileName.length + stored.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + fileName.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, fileName, stored, central, fileName, eocd]);
}

const db = Buffer.from('SQLite format 3\u0000 and then some rows');

describe('extractArrDatabase', () => {
  it('passes a deflated member through untouched', () => {
    const deflated = deflateRawSync(db);
    const zip = makeZip('sonarr.db', deflated, 8);
    const result = extractArrDatabase(zip);
    expect(result.app).toBe('sonarr');
    expect(inflateRawSync(result.deflate).equals(db)).toBe(true);
  });

  it('deflates a stored member', () => {
    const zip = makeZip('radarr.db', db, 0);
    const result = extractArrDatabase(zip);
    expect(result.app).toBe('radarr');
    expect(inflateRawSync(result.deflate).equals(db)).toBe(true);
  });

  it('finds the database inside a folder', () => {
    const zip = makeZip('Backups/radarr.db', deflateRawSync(db), 8);
    expect(extractArrDatabase(zip).app).toBe('radarr');
  });

  it('rejects a zip with no *arr database', () => {
    const zip = makeZip('config.xml', deflateRawSync(Buffer.from('<xml/>')), 8);
    expect(() => extractArrDatabase(zip)).toThrow(DmmImportError);
  });

  it('rejects a file that is not a zip', () => {
    expect(() => readZipEntries(Buffer.from('not a zip at all'))).toThrow(/not a zip/i);
  });
});
