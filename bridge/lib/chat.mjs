import { EventEmitter } from 'node:events';
import { fail } from './security.mjs';

const SOURCES = ['cli', 'vscode', 'exec', 'appServer', 'unknown'];
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,150}$/.test(value);
const safeText = value => typeof value === 'string' ? value.slice(0, 200000) : '';

export class Chat extends EventEmitter {
  constructor(rpc, assets, workspace) {
    super();
    this.rpc = rpc;
    this.assets = assets;
    this.workspace = workspace;
    this.loaded = new Set();
    this.active = new Map();
    this.starting = new Set();
    this.approvals = new Map();
    this.events = [];
    this.sequence = 0;
    this.queue = Promise.resolve();
    rpc.on('notification', message => {
      this.queue = this.queue.then(() => this.notification(message)).catch(() => {});
    });
    rpc.on('request', message => this.request(message));
    rpc.on('disconnect', () => {
      this.loaded.clear(); this.active.clear(); this.starting.clear(); this.approvals.clear();
      this.publish({ type: 'offline' });
    });
  }
  publish(event) {
    const entry = { ...event, seq: ++this.sequence };
    this.events.push(entry);
    if (this.events.length > 1000) this.events.shift();
    this.emit('event');
  }
  poll(after, threadId) {
    const reset = after > this.sequence || (this.events.length && after < this.events[0].seq - 1);
    return {
      cursor: this.sequence, reset: Boolean(reset),
      events: this.events.filter(e => e.seq > after && (!e.threadId || e.threadId === threadId)),
    };
  }
  summary(thread) {
    return {
      id: thread.id, title: safeText(thread.name || thread.preview || '新对话').slice(0, 100),
      updatedAt: thread.updatedAt, model: thread.model,
      busy: this.active.has(thread.id) || thread.status?.type === 'active',
      canInterrupt: this.active.has(thread.id),
    };
  }
  async status() {
    await this.rpc.connect();
    const [account, capabilities, models] = await Promise.all([
      this.rpc.call('account/read', { refreshToken: false }),
      this.rpc.call('modelProvider/capabilities/read').catch(() => ({ imageGeneration: false })),
      this.rpc.call('model/list', { limit: 100 }),
    ]);
    return {
      online: true, authenticated: Boolean(account.account),
      imageGeneration: Boolean(capabilities.imageGeneration),
      models: models.data.filter(model => !model.hidden).map(model => ({
        id: model.model || model.id, name: model.displayName || model.id, isDefault: model.isDefault,
      })),
    };
  }
  async list(cursor, searchTerm) {
    await this.rpc.connect();
    const result = await this.rpc.call('thread/list', {
      limit: 50, sortKey: 'updated_at', modelProviders: [], sourceKinds: SOURCES,
      ...(cursor ? { cursor } : {}), ...(searchTerm ? { searchTerm: searchTerm.slice(0, 100) } : {}),
    });
    return { threads: result.data.map(t => this.summary(t)), nextCursor: result.nextCursor };
  }
  async create(model) {
    await this.rpc.connect();
    const result = await this.rpc.call('thread/start', {
      cwd: this.workspace, sandbox: 'workspace-write', approvalPolicy: 'on-request',
      ...(model ? { model } : {}),
      developerInstructions: '这是用户自己的私人聊天网页。默认用中文交流。生成图片时调用可用的内置 image generation 工具，保留生成文件用于下载和后续改图。用户未要求时不要修改项目或运行命令。',
    });
    this.loaded.add(result.thread.id);
    return this.summary(result.thread);
  }
  async normalize(item) {
    const base = { id: item.id, type: item.type };
    if (item.type === 'agentMessage') {
      return { ...base, role: 'assistant', text: safeText(item.text), images: await this.assets.fromMarkdown(safeText(item.text)) };
    }
    if (item.type === 'userMessage') {
      const text = (item.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      const images = [];
      for (const input of item.content || []) if (input.type === 'localImage') {
        try { images.push(await this.assets.register(input.path)); } catch { /* Missing local reference. */ }
      }
      return { ...base, role: 'user', text: safeText(text), images };
    }
    if (item.type === 'imageGeneration') {
      const image = item.status === 'completed' ? await this.assets.generated(item) : null;
      return { ...base, role: 'assistant', status: item.status,
        text: image ? '' : item.status === 'failed' ? '图片生成失败，请修改要求后重试。' : item.status === 'completed' ? '图片已生成，暂时无法读取原图，请在电脑端查看。' : '正在绘图…',
        images: image ? [image] : [],
      };
    }
    return null;
  }
  async read(threadId, cursor) {
    if (!validId(threadId)) throw fail(400, '对话编号不正确');
    await this.rpc.connect();
    const snapshotCursor = this.sequence;
    const { thread } = await this.rpc.call('thread/read', { threadId });
    let entries, nextCursor;
    if (thread.historyMode === 'paginated') {
      const page = await this.rpc.call('thread/items/list', {
        threadId, limit: 100, sortDirection: 'desc', ...(cursor ? { cursor } : {}),
      });
      entries = page.data.map(entry => entry.item || entry).reverse();
      nextCursor = page.nextCursor;
    } else {
      const full = await this.rpc.call('thread/read', { threadId, includeTurns: true });
      entries = (full.thread.turns || []).flatMap(turn => turn.items || []);
    }
    const items = (await Promise.all(entries.map(item => this.normalize(item)))).filter(Boolean);
    return {
      thread: this.summary(thread), items, nextCursor,
      approvals: [...this.approvals.values()].filter(a => a.threadId === threadId),
      cursor: snapshotCursor,
    };
  }
  async send(threadId, body) {
    if (!validId(threadId)) throw fail(400, '对话编号不正确');
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length > 30000) throw fail(400, '消息不能超过 30000 字');
    if (!Array.isArray(body.attachments) || body.attachments.length > 4) throw fail(400, '每次最多上传 4 张参考图');
    if (!text && !body.attachments.length) throw fail(400, '请输入消息或选择参考图');
    if (this.active.has(threadId) || this.starting.has(threadId)) throw fail(409, '这段对话正在回复，请稍后再发送');
    this.starting.add(threadId);
    try {
      await this.rpc.connect();
      if (!this.loaded.has(threadId)) {
        const { thread } = await this.rpc.call('thread/read', { threadId });
        if (thread.status?.type === 'active') throw fail(409, '这段对话正在电脑端运行，请等待完成');
        // Keep existing conversation permissions and instructions when resuming.
        await this.rpc.call('thread/resume', { threadId, excludeTurns: true });
        this.loaded.add(threadId);
      }
      const input = [];
      if (text) input.push({ type: 'text', text: body.imageMode ? `请生成或编辑图片：\n${text}` : text });
      for (const id of body.attachments) {
        if (typeof id !== 'string') throw fail(400, '图片编号不正确');
        const image = await this.assets.get(id);
        input.push({ type: 'localImage', path: image.path });
      }
      const { turn } = await this.rpc.call('turn/start', { threadId, input, ...(body.model ? { model: body.model } : {}) });
      if (turn.status === 'inProgress') this.active.set(threadId, turn.id);
      return { turnId: turn.id, status: turn.status };
    } finally { this.starting.delete(threadId); }
  }
  async interrupt(threadId) {
    const turnId = this.active.get(threadId);
    if (!turnId) throw fail(409, '没有正在进行的回复');
    await this.rpc.call('turn/interrupt', { threadId, turnId });
    return { ok: true };
  }
  async notification({ method, params = {} }) {
    const { threadId, turnId, item } = params;
    if (method === 'turn/started') {
      this.active.set(threadId, params.turn.id);
      this.publish({ type: 'busy', threadId, turnId: params.turn.id });
    } else if (method === 'turn/completed') {
      this.active.delete(threadId);
      for (const [id, approval] of this.approvals) if (approval.threadId === threadId) this.approvals.delete(id);
      this.publish({ type: 'done', threadId, status: params.turn.status, error: params.turn.error?.message });
    } else if (method === 'item/agentMessage/delta') {
      this.publish({ type: 'delta', threadId, itemId: params.itemId, delta: params.delta });
    } else if (method === 'item/started' || method === 'item/completed') {
      const normalized = await this.normalize(item);
      if (normalized) this.publish({ type: 'item', threadId, turnId, item: normalized });
      else if (method === 'item/started') this.publish({ type: 'activity', threadId,
        text: item.type === 'webSearch' ? '正在搜索…' : '正在处理…' });
    } else if (method === 'serverRequest/resolved') {
      this.approvals.delete(String(params.requestId));
      this.publish({ type: 'resolved', threadId, id: String(params.requestId) });
    } else if (method === 'error') {
      this.publish({ type: 'warning', threadId, text: params.error?.message || '回复遇到问题，请重试' });
    }
  }
  request({ id, method, params = {} }) {
    const supported = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval',
      'item/permissions/requestApproval', 'item/tool/requestUserInput', 'tool/requestUserInput'];
    if (!supported.includes(method)) { this.rpc.reject(id); return; }
    if (this.approvals.size >= 100) { this.rpc.reject(id, '等待处理的请求过多'); return; }
    const approval = {
      id: String(id), method, threadId: params.threadId,
      title: params.reason || (method.includes('requestUserInput') ? '需要你的回答' : '需要你的确认'),
      command: params.command || null,
      questions: params.questions || [], permissions: params.permissions || null,
    };
    this.approvals.set(String(id), approval);
    this.publish({ type: 'approval', threadId: params.threadId, approval });
  }
  answer(id, body) {
    const approval = this.approvals.get(id);
    if (!approval) throw fail(409, '这项请求已处理，请刷新对话');
    let result;
    if (approval.method.includes('requestUserInput')) {
      const answers = {};
      for (const question of approval.questions) {
        const answer = body.answers?.[question.id];
        if (typeof answer !== 'string' || answer.length > 5000) throw fail(400, '请填写所有回答');
        answers[question.id] = { answers: [answer] };
      }
      result = { answers };
    } else {
      if (!['accept', 'decline'].includes(body.decision)) throw fail(400, '请选择允许或拒绝');
      result = approval.method.includes('permissions')
        ? { permissions: body.decision === 'accept' ? approval.permissions || {} : {}, scope: 'turn' }
        : { decision: body.decision };
    }
    this.rpc.respond(/^\d+$/.test(id) ? Number(id) : id, result);
    this.approvals.delete(id);
    this.publish({ type: 'resolved', threadId: approval.threadId, id });
    return { ok: true };
  }
}
