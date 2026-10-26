import { readFile, writeFile, mkdir, realpath, stat, rename, open } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fail, imageType, secret } from './security.mjs';

export class Assets {
  constructor(directory, roots) {
    this.directory = directory;
    this.roots = [directory, ...roots];
    this.entries = new Map();
    this.saving = Promise.resolve();
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true });
    try {
      const stored = JSON.parse(await readFile(join(this.directory, 'index.json'), 'utf8'));
      for (const entry of stored) if (/^[a-f0-9]{32}$/.test(entry.id)) this.entries.set(entry.id, entry);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this;
  }
  async allowed(file) {
    const actual = await realpath(file);
    for (const root of this.roots) {
      let canonical;
      try { canonical = await realpath(root); } catch { continue; }
      const rel = relative(canonical, actual);
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return actual;
    }
    throw fail(403, '此文件未开放下载');
  }
  descriptor(entry) {
    return { id: entry.id, url: `/api/chat/assets/${entry.id}`, name: entry.name, type: `image/${entry.type}` };
  }
  async save() {
    this.saving = this.saving.catch(() => {}).then(async () => {
      const file = join(this.directory, 'index.json');
      await writeFile(file + '.tmp', JSON.stringify([...this.entries.values()]), { mode: 0o600 });
      await rename(file + '.tmp', file);
    });
    return this.saving;
  }
  async register(file, name) {
    const actual = await this.allowed(file);
    const info = await stat(actual);
    if (!info.isFile() || info.size > 50 * 1024 * 1024) throw fail(413, '图片过大');
    const handle = await open(actual, 'r');
    let prefix;
    try { prefix = Buffer.alloc(16); await handle.read(prefix, 0, 16, 0); }
    finally { await handle.close(); }
    const type = imageType(prefix);
    if (!type) throw fail(415, '仅支持 PNG、JPEG、WebP 图片');
    const id = createHash('sha256').update(actual).digest('hex').slice(0, 32);
    if (!this.entries.has(id)) {
      this.entries.set(id, { id, path: actual, name: (name || basename(file)).slice(0, 150), type });
      await this.save();
    }
    return this.descriptor(this.entries.get(id));
  }
  async upload(buffer, name = '参考图') {
    const type = imageType(buffer);
    if (!type) throw fail(415, '请上传 PNG、JPEG 或 WebP 图片');
    const file = join(this.directory, `${secret()}.${type}`);
    await writeFile(file, buffer, { mode: 0o600, flag: 'wx' });
    return this.register(file, name);
  }
  async generated(item) {
    if (item.savedPath) {
      try { return await this.register(item.savedPath, '生成图片'); } catch { /* Try inline result. */ }
    }
    let value = item.result;
    if (!value || value.length > 70 * 1024 * 1024) return null;
    value = value.replace(/^data:image\/(png|jpeg|webp);base64,/, '');
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(value)) return null;
    const bytes = Buffer.from(value, 'base64');
    if (!imageType(bytes)) return null;
    // Deterministic filename avoids duplicate files when reloading a stored chat.
    const type = imageType(bytes);
    const file = join(this.directory, `generated-${createHash('sha256').update(bytes).digest('hex')}.${type}`);
    try { await writeFile(file, bytes, { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    return this.register(file, '生成图片');
  }
  async get(id) {
    const entry = this.entries.get(id);
    if (!entry) throw fail(404, '找不到这张图片');
    await this.allowed(entry.path);
    return entry;
  }
  async fromMarkdown(text) {
    const images = [];
    for (const match of text.matchAll(/!\[[^\]]*\]\(<?([^\n]+?)>?\)/g)) {
      const file = match[1].replace(/^sandbox:/, '').replace(/%20/g, ' ');
      if (!isAbsolute(file)) continue;
      try { images.push(await this.register(resolve(file))); } catch { /* Not a downloadable image. */ }
    }
    return images;
  }
}
