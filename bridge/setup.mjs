import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { hashPassword, secret } from './lib/security.mjs';
import { codexCommand } from './lib/rpc.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = join(root, '.bridge-local');
const configPath = resolve(process.env.PECO_CHAT_CONFIG || join(local, 'config.json'));
await mkdir(local, { recursive: true });
try {
  await access(configPath);
  console.log('配置已存在，已保留原密码。启动：npm run chat:start');
} catch {
  // Optional JSON on stdin permits choosing a password without shell arguments or environment logs.
  let input = {};
  if (!process.stdin.isTTY) {
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    if (text.trim()) input = JSON.parse(text);
  }
  const password = input.password || randomBytes(15).toString('base64url');
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('密码需要 12–256 个字符');
  const config = {
    port: 8787,
    origins: ['https://peco.ink', 'https://www.peco.ink'],
    proxyToken: secret(),
    password: await hashPassword(password),
    ...(process.env.CODEX_BIN ? { codex: { command: codexCommand()[0], args: codexCommand()[1] } } : {}),
  };
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await writeFile(join(local, 'access.txt'), [
    'Peco 私人聊天 · 仅保存在本电脑，请勿上传到 GitHub',
    '', `网页登录密码：${password}`, '',
    'Cloudflare Pages 环境变量（选择 Secret / 加密）：',
    `CHAT_BRIDGE_TOKEN=${config.proxyToken}`,
    'CHAT_BRIDGE_URL=https://你配置的电脑隧道域名',
    '', '本机测试：http://127.0.0.1:8787/chat/',
    '启动服务：npm run chat:start',
  ].join('\n'), { mode: 0o600, flag: 'wx' });
  await writeFile(join(local, 'tunnel-token.txt'), '', { mode: 0o600, flag: 'wx' }).catch(error => {
    if (error.code !== 'EEXIST') throw error;
  });
  console.log('配置已生成。密码和 Cloudflare 配置保存在 .bridge-local/access.txt（Git 已忽略）。');
  console.log('启动：npm run chat:start');
}
