#!/usr/bin/env bun
/**
 * Single entry point for bringing the whole stack up: `bun run app:up`.
 *
 * Order matters: the three MongoDB members must form the replica set `rs0`
 * BEFORE the main `up` — until the set config exists their healthcheck always
 * fails, and Docker Compose fail-fasts on an unhealthy dependency
 * ("dependency failed to start: container docker-mongodb-1 is unhealthy"),
 * leaving the whole stack down.
 *
 * TypeScript on purpose: `bun run app:up` has to work from any shell —
 * PowerShell, cmd, git-bash, Linux. A bash wrapper would break in a plain
 * Windows shell, where `bash` may resolve to the WSL launcher and git-bash
 * coreutils are not on PATH.
 *
 * Steps:
 *   1. `docker compose up -d` for the three members (no-op when running);
 *   2. the set init: one-shot helper container fed `init-mongo-container.sh`
 *      over stdin (`docker run --rm` — nothing stays behind in the stack);
 *   3. wait until all three members report `healthy` (healthcheck interval is
 *      10s) so the `up` below never meets a stale `unhealthy` state;
 *   4. `docker compose up -d` for the rest of the stack.
 *
 * Safe to re-run at any time: on a fresh volume it creates the set, on a
 * running stack every step is a no-op.
 */
import { join } from 'node:path';

const scriptDir = import.meta.dir;
const composeDir = join(scriptDir, '..', '..', 'infrastructure', 'docker');
const MEMBER_SERVICES = ['mongodb', 'mongodb-2', 'mongodb-3'];

/** Runs `docker compose up -d <args>` in the compose dir, streaming output to the terminal. */
async function composeUp(...args: string[]): Promise<void> {
  const proc = Bun.spawn(['docker', 'compose', 'up', '-d', ...args], {
    cwd: composeDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`docker compose up -d ${args.join(' ')} exited with code ${code}`);
  }
}

/** Runs a command and returns its trimmed stdout, or null on a non-zero exit. */
function capture(cmd: string[], cwd?: string): string | null {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) return null;
  return proc.stdout.toString().trim();
}

/** Container ids of the three mongodb members (empty when none are running). */
function memberIds(): string[] {
  const out = capture(['docker', 'compose', 'ps', '-q', ...MEMBER_SERVICES], composeDir);
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean);
}

async function main(): Promise<void> {
  const extra = process.argv.slice(2);

  console.log('--------------------------------------------------');
  console.log('🚀 Starting the stack');
  console.log('--------------------------------------------------');

  // 1. The replica set members must be running (no-op when they already are).
  await composeUp(...MEMBER_SERVICES, ...extra);

  // 2. Detect the network of the running `mongodb` member (works for any compose project name).
  const memberId = capture(['docker', 'compose', 'ps', '-q', 'mongodb'], composeDir);
  if (!memberId) throw new Error(`The 'mongodb' container is not running`);
  const networks = capture(['docker', 'inspect', memberId, '--format', '{{json .NetworkSettings.Networks}}']);
  if (!networks) throw new Error('Could not inspect the mongodb container');
  const network = Object.keys(JSON.parse(networks) as Record<string, unknown>)[0];
  if (!network) throw new Error(`Could not detect the docker network of the 'mongodb' container`);
  console.log(`network: ${network}`);

  // 3. One-shot helper container, same payload the shell script feeds: creates
  //    the set on the first run, adds missing members on later runs, exits 0
  //    as soon as the set is READY.
  const payload = await Bun.file(join(scriptDir, 'init-mongo-container.sh')).text();
  const initProc = Bun.spawn(['docker', 'run', '--rm', '-i', '--network', network, 'mongo:8.3.11', 'bash', '-s'], {
    stdin: Buffer.from(payload),
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const initCode = await initProc.exited;
  if (initCode !== 0) {
    throw new Error(`MongoDB replica set initialization failed (helper container exited with ${initCode})`);
  }

  // 4. Wait for `healthy` on all three members before the full `up` — Compose
  //    treats a stale `unhealthy` dependency as a hard failure (fail-fast).
  const maxAttempts = 40;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ids = memberIds();
    const healthy = ids.filter(
      (id) => capture(['docker', 'inspect', '--format', '{{.State.Health.Status}}', id]) === 'healthy',
    ).length;
    if (ids.length === MEMBER_SERVICES.length && healthy === MEMBER_SERVICES.length) break;
    if (attempt === maxAttempts) {
      throw new Error(
        `MongoDB members did not become healthy within 120s (running: ${ids.length}, healthy: ${healthy})`,
      );
    }
    await Bun.sleep(3000);
  }

  // 5. The rest of the stack.
  await composeUp(...extra);

  console.log('--------------------------------------------------');
  console.log('✅ Stack is up');
  console.log('--------------------------------------------------');
}

main().catch((error: unknown) => {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
