import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function startTunnel(local) {
  const tokenFile = join(local, 'tunnel-token.txt');
  const token = (await readFile(tokenFile, 'utf8')).trim();
  if (!/^[A-Za-z0-9_+/.=-]{40,8192}$/.test(token)) throw new Error('请把 Cloudflare 隧道 Token 单独保存到 .bridge-local/tunnel-token.txt');
  await writeFile(tokenFile, token, { mode: 0o600 });
  let binary = process.env.CLOUDFLARED_BIN;
  if (!binary && process.platform === 'win32') {
    const file = join(local, 'tools/cloudflared.exe');
    try { await access(file); binary = file; } catch { /* Fall back to PATH. */ }
  }
  const child = spawn(binary || 'cloudflared', ['tunnel', '--no-autoupdate', 'run', '--token-file', tokenFile], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let connected = false;
  child.stderr.on('data', chunk => {
    if (!connected && chunk.toString().includes('Registered tunnel connection')) {
      connected = true; console.log('电脑隧道已连接。');
    }
  });
  child.on('error', () => console.error('无法启动 Cloudflare 连接器，请按 README-chat.md 安装 cloudflared。'));
  child.on('exit', code => {
    if (code) console.error(`电脑隧道已停止（${code}），请检查 Token、网络和 Cloudflare 面板。`);
  });
  console.log('正在连接电脑隧道…');
  return child;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const child = await startTunnel(join(root, '.bridge-local'));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
