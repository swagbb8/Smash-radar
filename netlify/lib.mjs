// Netlify adapter: state lives in Netlify Blobs; refreshes run in time-boxed slices.
import { emptyState } from '../src/engine.js';

export class BlobStore {
  async _store() {
    if (!this.blobs) {
      const { getStore } = await import('@netlify/blobs');
      this.blobs = getStore({ name: 'smash-radar', consistency: 'strong' });
    }
    return this.blobs;
  }
  async load() {
    if (this.state) return this.state;
    const s = await this._store();
    this.state = (await s.get('state', { type: 'json' })) || emptyState();
    this.state.rejections ||= []; this.state.runs ||= []; this.state.sources ||= {}; this.state.meta ||= {};
    return this.state;
  }
  async save(state = this.state) {
    this.state = state;
    await (await this._store()).setJSON('state', state);
  }
}
