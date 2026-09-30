// Storage adapters. All expose { load(): Promise<state>, save(state): Promise<void> }.
// FileStore keeps state in memory and writes atomically to a JSON file (the Node server's database).
import fs from 'node:fs';
import path from 'node:path';
import { emptyState } from './engine.js';

export class FileStore {
  constructor(file) {
    this.file = file;
    this.state = null;
    this.writing = Promise.resolve();
  }
  async load() {
    if (this.state) return this.state;
    try {
      this.state = JSON.parse(await fs.promises.readFile(this.file, 'utf8'));
      if (!this.state.stories) this.state = emptyState();
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // Corrupt file: keep a copy, start fresh rather than crash.
        try { await fs.promises.copyFile(this.file, `${this.file}.corrupt-${Date.now()}`); } catch {}
      }
      this.state = emptyState();
    }
    this.state.rejections ||= [];
    this.state.runs ||= [];
    this.state.sources ||= {};
    this.state.meta ||= {};
    return this.state;
  }
  async save(state = this.state) {
    this.state = state;
    this.writing = this.writing.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, JSON.stringify(state));
      await fs.promises.rename(tmp, this.file);
    });
    return this.writing;
  }
}

export class MemoryStore {
  constructor(state = emptyState()) { this.state = state; }
  async load() { return this.state; }
  async save(state) { this.state = state; }
}
