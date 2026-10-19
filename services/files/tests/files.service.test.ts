/**
 * Unit tests for FileService.
 *
 * Scope: the service layer only. The repository and the storage client are
 * replaced with in-memory fakes (tests/fakes/*.fake.ts), so these tests need
 * no database, no disk and no network. Run with `bun test` from services/files.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { FileService } from '../src/services/file.service';
import type { FileRepository } from '../src/repositories/file.repository';
import type { StorageClient } from '../src/clients/storage.client';
import { createFakeFileRepository, type CreateFileInput, type FakeFileRepository } from './fakes/file.repository.fake';
import { createFakeStorageClient, type FakeStorageClient } from './fakes/storage.client.fake';

/**
 * Fixtures with real magic bytes: file-type derives the content type from
 * these leading bytes, so the rest of the payload only keeps the shape valid.
 */
const PNG_BYTES = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR chunk: length 13 + type
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01, // width 1, height 1
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1f,
  0x15,
  0xc4,
  0x89, // bit depth, color type, CRC
  0x00,
  0x00,
  0x00,
  0x0a,
  0x49,
  0x44,
  0x41,
  0x54, // IDAT chunk header
  0x78,
  0x9c,
  0x63,
  0x60,
  0x00,
  0x00,
  0x00,
  0x02,
  0x00,
  0x01, // placeholder payload
]);

const JPEG_BYTES = Buffer.from([
  0xff,
  0xd8, // SOI
  0xff,
  0xe0,
  0x00,
  0x10, // APP0 chunk
  0x4a,
  0x46,
  0x49,
  0x46,
  0x00, // 'JFIF\0'
  0x01,
  0x01,
  0x00, // version 1.1, no density units
  0x00,
  0x01,
  0x00,
  0x01, // density 1x1
  0x00,
  0x00, // no thumbnail
  0xff,
  0xd9, // EOI
]);

const GIF_BYTES = Buffer.from([
  0x47,
  0x49,
  0x46,
  0x38,
  0x39,
  0x61, // 'GIF89a'
  0x01,
  0x00,
  0x01,
  0x00, // logical screen width/height 1x1
  0x00,
  0x00,
  0x00, // no global color table, background 0, aspect 0
  0x3b, // trailer
]);

const WEBP_BYTES = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // 'RIFF'
  0x0a,
  0x00,
  0x00,
  0x00, // file size field
  0x57,
  0x45,
  0x42,
  0x50, // 'WEBP'
  0x56,
  0x50,
  0x38,
  0x20, // 'VP8 ' chunk tag
  0x06,
  0x00,
  0x00,
  0x00, // chunk size
  0x00,
  0x00, // placeholder payload
]);

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  'utf8',
);

// BMP is detectable from its magic bytes but has no entry in the service allow-list.
const BMP_BYTES = Buffer.from([
  0x42,
  0x4d, // 'BM'
  0x3a,
  0x00,
  0x00,
  0x00, // file size
  0x00,
  0x00,
  0x00,
  0x00, // reserved
  0x36,
  0x00,
  0x00,
  0x00, // pixel data offset
  0x28,
  0x00,
  0x00,
  0x00, // DIB header size
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00, // width, height
]);

// Plain text matches no known signature, so the content type stays undetectable.
const TEXT_BYTES = Buffer.from('plain text with no recognizable magic bytes', 'utf8');

const STORED_FILE = {
  name: 'photo.png',
  path: '2026/01/01/0/upload-1.png',
  size: PNG_BYTES.length,
  mimeType: 'image/png',
};

function makeUpload(name: string, declaredType: string, bytes: Uint8Array): File {
  return new File([bytes], name, { type: declaredType });
}

/**
 * File-like stand-in used when the declared type must reach the service
 * verbatim: the File constructor normalizes its `type` argument, which would
 * hide the parsing the service performs on client-supplied values.
 */
function makeUploadWithRawType(name: string, rawType: string, bytes: Uint8Array): File {
  return {
    name,
    type: rawType,
    size: bytes.byteLength,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  } as unknown as File;
}

describe('FileService (unit, fake repository + fake storage client)', () => {
  let files: FakeFileRepository;
  let storage: FakeStorageClient;
  let service: FileService;

  beforeEach(() => {
    files = createFakeFileRepository();
    storage = createFakeStorageClient();
    service = new FileService(files as unknown as FileRepository, storage as unknown as StorageClient);
  });

  /** Writes a consistent pair (repository record + stored bytes) into the fakes. */
  async function seedStoredFile(overrides: Partial<CreateFileInput> = {}) {
    const doc = await files.create({ ...STORED_FILE, ...overrides });
    storage.store.set(doc.path, Buffer.from(PNG_BYTES));
    return doc;
  }

  test('createFile: detects the type from content, saves the bytes and maps the record', async () => {
    const result = await service.createFile({ file: makeUpload('photo.png', 'image/png', PNG_BYTES) });

    // The canonical extension (derived from the detected type) drives the storage path.
    expect(storage.generatePath).toHaveBeenCalledTimes(1);
    expect(storage.generatePath).toHaveBeenCalledWith('png');
    expect(storage.saveFile).toHaveBeenCalledTimes(1);
    expect(storage.saveFile.mock.calls[0]?.[0]).toBe(result.path);

    const savedBytes = storage.store.get(result.path);
    expect(savedBytes?.equals(PNG_BYTES)).toBe(true);

    // The recorded MIME type is the detected one, never the declared one.
    expect(files.create).toHaveBeenCalledTimes(1);
    expect(files.create).toHaveBeenCalledWith({
      name: 'photo.png',
      path: result.path,
      size: PNG_BYTES.length,
      mimeType: 'image/png',
    });

    expect(Object.keys(result).sort()).toEqual(['id', 'mimeType', 'name', 'path', 'size']);
    expect(result.name).toBe('photo.png');
    expect(result.size).toBe(PNG_BYTES.length);
    expect(result.id).toHaveLength(24); // Mongo ObjectId hex
    // The result must be plain JSON — no ObjectId or class instances leaking to the caller.
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('createFile: derives the canonical extension for every allowed type', async () => {
    const allowedCases = [
      { name: 'photo.png', declaredType: 'image/png', bytes: PNG_BYTES, extension: 'png' },
      { name: 'photo.jpg', declaredType: 'image/jpeg', bytes: JPEG_BYTES, extension: 'jpg' },
      { name: 'cover.webp', declaredType: 'image/webp', bytes: WEBP_BYTES, extension: 'webp' },
      { name: 'anim.gif', declaredType: 'image/gif', bytes: GIF_BYTES, extension: 'gif' },
      { name: 'scan.pdf', declaredType: 'application/pdf', bytes: PDF_BYTES, extension: 'pdf' },
    ];

    for (const allowed of allowedCases) {
      storage.generatePath.mockClear();

      const result = await service.createFile({
        file: makeUpload(allowed.name, allowed.declaredType, allowed.bytes),
      });

      expect(storage.generatePath).toHaveBeenCalledWith(allowed.extension);
      expect(result.mimeType).toBe(allowed.declaredType);
      expect(result.path.endsWith(`.${allowed.extension}`)).toBe(true);
    }

    expect(files.create).toHaveBeenCalledTimes(allowedCases.length);
  });

  test('createFile: strips media-type parameters and lowercases the declared type', async () => {
    const upload = makeUploadWithRawType('photo.png', 'IMAGE/PNG; charset=binary', PNG_BYTES);

    const result = await service.createFile({ file: upload });

    expect(storage.generatePath).toHaveBeenCalledWith('png');
    expect(result.mimeType).toBe('image/png');
  });

  test('createFile: rejects a declared type that contradicts the detected content', async () => {
    await expect(service.createFile({ file: makeUpload('photo.png', 'image/jpeg', PNG_BYTES) })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'File type is not allowed',
    });

    expect(storage.generatePath).toHaveBeenCalledTimes(0);
    expect(storage.saveFile).toHaveBeenCalledTimes(0);
    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('createFile: rejects a detected type outside the allow-list', async () => {
    await expect(service.createFile({ file: makeUpload('scan.bmp', 'image/bmp', BMP_BYTES) })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'File type is not allowed',
    });

    expect(storage.saveFile).toHaveBeenCalledTimes(0);
    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('createFile: rejects content with an undetectable type', async () => {
    await expect(service.createFile({ file: makeUpload('notes.txt', 'text/plain', TEXT_BYTES) })).rejects.toMatchObject(
      {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'File type is not allowed',
      },
    );

    expect(storage.generatePath).toHaveBeenCalledTimes(0);
    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('createFile: propagates a storage failure and never creates the record', async () => {
    storage.saveFile.mockRejectedValueOnce(new Error('disk unavailable'));

    await expect(service.createFile({ file: makeUpload('photo.png', 'image/png', PNG_BYTES) })).rejects.toThrow(
      'disk unavailable',
    );

    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('getFile: returns the mapped record when the physical file exists', async () => {
    const stored = await seedStoredFile();
    const id = stored._id.toString();

    const result = await service.getFile(id);

    expect(files.findById).toHaveBeenCalledWith(id);
    expect(storage.fileExists).toHaveBeenCalledWith(STORED_FILE.path);
    expect(result).toEqual({
      id,
      name: STORED_FILE.name,
      path: STORED_FILE.path,
      size: STORED_FILE.size,
      mimeType: STORED_FILE.mimeType,
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test('getFile: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.getFile('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'File unknown-id not found',
    });
  });

  test('getFile: maps a record whose physical file is missing to 404 NOT_FOUND', async () => {
    const doc = await files.create(STORED_FILE); // record only — nothing in storage

    await expect(service.getFile(doc._id.toString())).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Physical file not found',
    });
  });

  test('getFileByPath: returns the mapped record found by path', async () => {
    const stored = await seedStoredFile();

    const result = await service.getFileByPath(STORED_FILE.path);

    expect(files.findByPath).toHaveBeenCalledWith(STORED_FILE.path);
    expect(result.id).toBe(stored._id.toString());
    expect(result.path).toBe(STORED_FILE.path);
  });

  test('getFileByPath: propagates NOT_FOUND for an unknown path', async () => {
    await expect(service.getFileByPath('2026/01/01/0/missing.png')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'File 2026/01/01/0/missing.png not found',
    });
  });

  test('getFileByPath: maps a record whose physical file is missing to 404 NOT_FOUND', async () => {
    await files.create(STORED_FILE); // record only — nothing in storage

    await expect(service.getFileByPath(STORED_FILE.path)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Physical file not found',
    });
  });

  test('updateFile: applies a partial update and returns the mapped record', async () => {
    const stored = await seedStoredFile();
    const id = stored._id.toString();

    const result = await service.updateFile(id, { name: 'renamed.png' });

    expect(files.update).toHaveBeenCalledWith(id, { name: 'renamed.png' });
    expect(result.id).toBe(id);
    expect(result.name).toBe('renamed.png');
    expect(result.path).toBe(STORED_FILE.path);
  });

  test('updateFile: keeps the current name when no name is sent', async () => {
    const stored = await seedStoredFile();

    const result = await service.updateFile(stored._id.toString(), { name: undefined });

    expect(result.name).toBe(STORED_FILE.name);
  });

  test('updateFile: propagates NOT_FOUND for an unknown id', async () => {
    await expect(service.updateFile('unknown-id', { name: 'renamed.png' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  test('updateFile: maps a record whose physical file is missing to 404 NOT_FOUND', async () => {
    const doc = await files.create(STORED_FILE); // record only — nothing in storage

    await expect(service.updateFile(doc._id.toString(), { name: 'renamed.png' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Physical file not found',
    });
  });

  test('deleteFile: removes the record and the physical file', async () => {
    const stored = await seedStoredFile();
    const id = stored._id.toString();

    const result = await service.deleteFile(id);

    expect(result).toEqual({ id });
    expect(storage.deleteFile).toHaveBeenCalledWith(STORED_FILE.path);
    expect(files.delete).toHaveBeenCalledWith(id);
    expect(files.store.has(id)).toBe(false);
    expect(storage.store.has(STORED_FILE.path)).toBe(false);
  });

  test('deleteFile: propagates NOT_FOUND for an unknown id without touching storage', async () => {
    await expect(service.deleteFile('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'File unknown-id not found',
    });

    expect(storage.deleteFile).toHaveBeenCalledTimes(0);
    expect(files.delete).toHaveBeenCalledTimes(0);
  });
});
