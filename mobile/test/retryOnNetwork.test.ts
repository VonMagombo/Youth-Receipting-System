/**
 * .github/scripts/retry-on-network.sh wraps the CI Gradle build. It must retry downloads that failed
 * upstream (the 504s from the Kotlin compiler mirror that broke builds on 2026-11-09) and must NOT
 * retry real build errors, which would only waste minutes before failing anyway.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = new URL('../../.github/scripts/retry-on-network.sh', import.meta.url).pathname;
const NET_ERROR =
  "> Could not GET 'https://github.com/JetBrains/kotlin/releases/download/v2.2.0/kotlin-compiler-embeddable-2.2.0.jar'. Received status code 504 from server: Gateway Time-out";

/** A fake build that prints the given output per attempt and exits with the given codes, counting its runs. */
function fakeBuild(attempts: { out: string; code: number }[]) {
  const dir = mkdtempSync(join(tmpdir(), 'retry-'));
  const count = join(dir, 'count');
  writeFileSync(count, '0');
  const outs = attempts.map((a) => JSON.stringify(a.out)).join(' ');
  const codes = attempts.map((a) => a.code).join(' ');
  const cmd = join(dir, 'build.sh');
  writeFileSync(
    cmd,
    `n=$(cat ${count}); n=$((n+1)); echo $n > ${count}
outs=(${outs}); codes=(${codes})
echo "\${outs[$((n-1))]}"; exit "\${codes[$((n-1))]}"\n`,
  );
  const run = () => spawnSync('bash', [SCRIPT, '3', '0', '--', 'bash', cmd], { encoding: 'utf8' });
  return { run, runs: () => Number(readFileSync(count, 'utf8')) };
}

describe('retry-on-network.sh', () => {
  it('succeeds without retrying when the build passes', () => {
    const b = fakeBuild([{ out: 'BUILD SUCCESSFUL', code: 0 }]);
    expect(b.run().status).toBe(0);
    expect(b.runs()).toBe(1);
  });

  it('retries a 504 download failure and succeeds once the mirror recovers', () => {
    const b = fakeBuild([
      { out: NET_ERROR, code: 1 },
      { out: NET_ERROR, code: 1 },
      { out: 'BUILD SUCCESSFUL', code: 0 },
    ]);
    const r = b.run();
    expect(r.status).toBe(0);
    expect(b.runs()).toBe(3);
    expect(r.stdout).toContain('attempt 1 of 3');
  });

  it('gives up after the last attempt and keeps the build failure code', () => {
    const b = fakeBuild([
      { out: NET_ERROR, code: 1 },
      { out: NET_ERROR, code: 1 },
      { out: NET_ERROR, code: 1 },
    ]);
    const r = b.run();
    expect(r.status).toBe(1);
    expect(b.runs()).toBe(3);
    expect(r.stdout).toContain('still failing on network downloads after 3 attempts');
  });

  it('does not retry a real build error', () => {
    const b = fakeBuild([{ out: "e: file.kt:3:5 Unresolved reference 'foo'", code: 1 }]);
    const r = b.run();
    expect(r.status).toBe(1);
    expect(b.runs()).toBe(1);
    expect(r.stdout).toContain('not retrying');
  });

  it('refuses to run without the -- separator', () => {
    expect(spawnSync('bash', [SCRIPT, '3', '0', 'true'], { encoding: 'utf8' }).status).toBe(2);
  });
});
