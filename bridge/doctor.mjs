import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { CodexRpc } from './lib/rpc.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const file = resolve(process.env.PECO_CHAT_CONFIG || join(root, '.bridge-local/config.json'));
let rpc;
try {
  const config = JSON.parse(await readFile(file, 'utf8'));
  rpc = new CodexRpc({ cwd: dirname(file), command: config.codex?.command, args: config.codex?.args });
  await rpc.connect();
  const account = await rpc.call('account/read', { refreshToken: false });
  const capabilities = await rpc.call('modelProvider/capabilities/read');
  const threads = await rpc.call('thread/list', { limit: 1, modelProviders: [], sourceKinds: ['cli', 'vscode', 'appServer', 'exec', 'unknown'] });
  console.log(`电脑账号：${account.account ? '已登录' : '尚未登录，请先在电脑上登录 Codex'}`);
  console.log(`图片生成：${capabilities.imageGeneration ? '可用' : '当前连接未开放'}`);
  console.log(`会话读取：${Array.isArray(threads.data) ? '正常' : '未通过'}`);
  console.log('网站地址：' + config.origins.join('、'));
} catch (error) { console.error(error.code === 'ENOENT' ? '请先运行 npm run chat:setup' : error.message); process.exitCode = 1; }
finally { rpc?.close(); }
