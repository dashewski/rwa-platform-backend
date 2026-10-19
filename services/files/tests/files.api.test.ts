/**
 * Component tests for the files HTTP layer.
 *
 * The whole Elysia app is assembled in-process: real controllers and the real
 * FileService, with the repository and the storage client replaced by in-memory
 * fakes. Requests go through app.handle() — no port is bound, nothing is written
 * to disk and nothing is queried over the network.
 * Run with `bun test` from services/files.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ErrorHandlerPlugin } from '@shared/errors/error-handler.plugin';
import { createServicesPlugin } from '../src/plugins/services.plugin';
import { createControllersPlugin } from '../src/plugins/controllers.plugin';
import type { RepositoriesPlugin } from '../src/plugins/repositories.plugin';
import type { ClientsPlugin } from '../src/plugins/clients.plugin';
import { createFakeFileRepository, type FakeFileRepository } from './fakes/file.repository.fake';
import { createFakeStorageClient, type FakeStorageClient } from './fakes/storage.client.fake';

// Small bound so the controller size guard is exercised with a tiny fixture.
const MAX_FILE_SIZE = 512;

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

// Plain text matches no known signature, so the content type stays undetectable.
const TEXT_BYTES = Buffer.from('plain text with no recognizable magic bytes', 'utf8');

function makeUpload(name: string, declaredType: string, bytes: Uint8Array): File {
  return new File([bytes], name, { type: declaredType });
}

function buildApp(files: FakeFileRepository, storage: FakeStorageClient) {
  const repositoriesPlugin = new Elysia({ name: 'Repositories' }).decorate('fileRepository', files);
  const clientsPlugin = new Elysia({ name: 'Clients' }).decorate('storageClient', storage);

  const servicesPlugin = createServicesPlugin(
    repositoriesPlugin as unknown as RepositoriesPlugin,
    clientsPlugin as unknown as ClientsPlugin,
  );

  return new Elysia().onError(ErrorHandlerPlugin).use(createControllersPlugin(servicesPlugin, MAX_FILE_SIZE));
}

type App = ReturnType<typeof buildApp>;

async function postJson(app: App, path: string, body: unknown) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

  return { status: response.status, body: (await response.json()) as any };
}

async function postFile(app: App, path: string, file: File) {
  const form = new FormData();
  form.append('file', file);

  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      body: form,
    }),
  );

  return { status: response.status, body: (await response.json()) as any };
}

describe('files HTTP layer (component, fake repository + fake storage)', () => {
  let files: FakeFileRepository;
  let storage: FakeStorageClient;
  let app: App;

  beforeEach(() => {
    files = createFakeFileRepository();
    storage = createFakeStorageClient();
    app = buildApp(files, storage);
  });

  test('createFile → getFiles → updateFile → deleteFile round-trip', async () => {
    const created = await postFile(app, '/createFile', makeUpload('photo.png', 'image/png', PNG_BYTES));
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ name: 'photo.png', size: PNG_BYTES.length, mimeType: 'image/png' });
    expect(typeof created.body.id).toBe('string');
    expect(typeof created.body.path).toBe('string');

    // The bytes went to the fake storage: nothing was written to disk.
    const storedBytes = storage.store.get(created.body.path);
    expect(storedBytes?.equals(PNG_BYTES)).toBe(true);

    const fetched = await postJson(app, '/getFiles', { id: created.body.id });
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);

    const updated = await postJson(app, '/updateFile', { id: created.body.id, name: 'renamed.png' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('renamed.png');
    expect(updated.body.path).toBe(created.body.path);

    const deleted = await postJson(app, '/deleteFile', { id: created.body.id });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ id: created.body.id });
    expect(storage.store.has(created.body.path)).toBe(false);

    const after = await postJson(app, '/getFiles', { id: created.body.id });
    expect(after.status).toBe(404);
  });

  test('createFile: undetectable content maps to 400 VALIDATION_ERROR', async () => {
    const response = await postFile(app, '/createFile', makeUpload('notes.txt', 'text/plain', TEXT_BYTES));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'File type is not allowed' } });
    expect(storage.saveFile).toHaveBeenCalledTimes(0);
    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('createFile: content that contradicts the declared type maps to 400 VALIDATION_ERROR', async () => {
    // Bun's multipart parser derives File.type from the filename (the part's
    // Content-Type header is ignored here), so the contradiction must live in
    // the name/content pair: a .jpg upload that actually carries PNG bytes.
    const response = await postFile(app, '/createFile', makeUpload('photo.jpg', 'image/jpeg', PNG_BYTES));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('createFile: a file above MAX_FILE_SIZE maps to 400 before the service runs', async () => {
    const oversized = makeUpload('big.png', 'image/png', Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_FILE_SIZE)]));

    const response = await postFile(app, '/createFile', oversized);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
      },
    });
    expect(storage.generatePath).toHaveBeenCalledTimes(0);
    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('createFile: a payload without a file never reaches the service', async () => {
    const response = await postJson(app, '/createFile', {});

    expect(response.status).not.toBe(200);
    expect(storage.generatePath).toHaveBeenCalledTimes(0);
    expect(files.create).toHaveBeenCalledTimes(0);
  });

  test('getFiles: an unknown id maps to 404 NOT_FOUND', async () => {
    const response = await postJson(app, '/getFiles', { id: 'unknown-id' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'File unknown-id not found' } });
  });

  test('getFiles: a record whose physical file is missing maps to 404 NOT_FOUND', async () => {
    const orphan = await files.create({
      name: 'orphan.png',
      path: '2026/01/01/0/orphan.png',
      size: PNG_BYTES.length,
      mimeType: 'image/png',
    });

    const response = await postJson(app, '/getFiles', { id: orphan._id.toString() });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Physical file not found' } });
  });

  test('updateFile: keeps the current name when the payload omits it', async () => {
    const created = await postFile(app, '/createFile', makeUpload('photo.png', 'image/png', PNG_BYTES));

    const updated = await postJson(app, '/updateFile', { id: created.body.id });

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('photo.png');
  });

  test('deleteFile: a second delete of the same id maps to 404 NOT_FOUND', async () => {
    const created = await postFile(app, '/createFile', makeUpload('photo.png', 'image/png', PNG_BYTES));

    const first = await postJson(app, '/deleteFile', { id: created.body.id });
    expect(first.status).toBe(200);

    const second = await postJson(app, '/deleteFile', { id: created.body.id });
    expect(second.status).toBe(404);
    expect(second.body.error.message).toBe(`File ${created.body.id} not found`);
  });
});
