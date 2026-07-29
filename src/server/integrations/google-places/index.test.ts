import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGooglePlacesAdapter } from './index';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createGooglePlacesAdapter の選択', () => {
  it('GOOGLE_MAPS_API_KEY があれば実アダプタ', () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'test-key');
    const adapter = createGooglePlacesAdapter({ salonId: 's1', runIndex: 0 });
    expect(adapter.mode).toBe('real');
    expect(adapter.sourceName).toBe('google_places');
  });

  it('未設定ならモックアダプタ', () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    const adapter = createGooglePlacesAdapter({ salonId: 's1', runIndex: 0 });
    expect(adapter.mode).toBe('mock');
    expect(adapter.sourceName).toBe('google_places');
  });
});
