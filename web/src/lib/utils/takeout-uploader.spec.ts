import * as zip from '@zip.js/zip.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { MatchedTakeoutAsset } from './takeout-parser';
import { TakeoutUploader, type TakeoutImportOptions } from './takeout-uploader';

vi.mock('@immich/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@immich/sdk')>();
  return {
    ...actual,
    AssetMediaStatus: { Duplicate: 'duplicate', Created: 'created' },
    getAllAlbums: vi.fn().mockResolvedValue([]),
    createAlbum: vi.fn().mockResolvedValue({ id: 'mock-album-id-1', albumName: 'Trip' }),
    addAssetsToAlbum: vi.fn().mockResolvedValue({}),
    updateAsset: vi.fn().mockResolvedValue({}),
    getBaseUrl: vi.fn().mockReturnValue('http://localhost:2283/api'),
  };
});

vi.mock('$lib/utils', () => ({
  uploadRequest: vi.fn().mockResolvedValue({
    status: 201,
    data: { id: 'mock-asset-id-1', status: 'created' },
  }),
}));

vi.mock('$lib/managers/auth-manager.svelte', () => ({
  authManager: { params: {} },
}));

describe('takeout-uploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should upload assets and trigger metadata and album creation', async () => {
    const uploader = new TakeoutUploader();

    // Create a mock entry with getData returning a Blob
    const mockEntry = {
      filename: 'Takeout/Google Photos/Trip/photo.jpg',
      directory: false,
      uncompressedSize: 1024,
      getData: vi.fn().mockResolvedValue(new Blob(['fake-image-bytes'], { type: 'image/jpeg' })),
    } as unknown as zip.FileEntry;

    const mockAsset: MatchedTakeoutAsset = {
      zipFile: new File([], 'takeout.zip'),
      entry: mockEntry,
      fileName: 'photo.jpg',
      filePath: 'Takeout/Google Photos/Trip/photo.jpg',
      dirPath: 'Takeout/Google Photos/Trip',
      fileSize: 1024,
      captureDate: new Date('2023-08-15T10:00:00Z'),
      description: 'Beach sunset',
      latitude: 36.7783,
      longitude: -119.4179,
      isFavorite: true,
      albumNames: ['Trip'],
    };

    const options: TakeoutImportOptions = {
      syncAlbums: true,
      syncFavorites: true,
      syncMetadata: true,
      skipTrashed: true,
      includeArchived: true,
      includeUnmatched: true,
    };

    const progressUpdates: number[] = [];
    const stats = await uploader.upload([mockAsset], options, (s) => {
      progressUpdates.push(s.processed);
    });

    expect(stats.uploaded).toBe(1);
    expect(stats.errors).toBe(0);
    expect(stats.albumsCreated).toBe(1);
    expect(stats.status).toBe('completed');
  });
});
