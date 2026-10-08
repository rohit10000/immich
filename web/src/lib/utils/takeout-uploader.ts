/* eslint-disable tscompat/tscompat */
import {
  AssetMediaStatus,
  createAlbum,
  getAllAlbums,
  addAssetsToAlbum,
  updateAsset,
  getBaseUrl,
  type AssetMediaResponseDto,
  type AlbumResponseDto,
} from '@immich/sdk';
import * as zip from '@zip.js/zip.js';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { uploadRequest } from '$lib/utils';
import { asQueryString } from '$lib/utils/shared-links';
import type { MatchedTakeoutAsset } from './takeout-parser';

export interface TakeoutImportOptions {
  syncAlbums: boolean;
  syncFavorites: boolean;
  syncMetadata: boolean; // descriptions and GPS coordinates
  skipTrashed: boolean;
  includeArchived: boolean;
  includeUnmatched: boolean;
}

export interface TakeoutUploadStats {
  total: number;
  processed: number;
  uploaded: number;
  duplicates: number;
  errors: number;
  albumsCreated: number;
  currentFileName: string;
  bytesUploaded: number;
  totalBytes: number;
  status: 'idle' | 'scanning' | 'ready' | 'uploading' | 'completed' | 'cancelled' | 'error';
  errorMessage?: string;
}

export class TakeoutUploader {
  private abortController: AbortController | null = null;
  private albumCache = new Map<string, string>(); // albumName -> albumId

  async upload(
    assets: MatchedTakeoutAsset[],
    options: TakeoutImportOptions,
    onProgress: (stats: TakeoutUploadStats) => void,
  ): Promise<TakeoutUploadStats> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Filter assets according to user options
    const filteredAssets = assets.filter((asset) => {
      if (options.skipTrashed && asset.isTrashed) {
        return false;
      }
      if (!options.includeArchived && asset.isArchived) {
        return false;
      }
      if (!options.includeUnmatched && !asset.metadata) {
        return false;
      }
      return true;
    });

    const totalBytes = filteredAssets.reduce((sum, a) => sum + (a.fileSize || 0), 0);

    const stats: TakeoutUploadStats = {
      total: filteredAssets.length,
      processed: 0,
      uploaded: 0,
      duplicates: 0,
      errors: 0,
      albumsCreated: 0,
      currentFileName: '',
      bytesUploaded: 0,
      totalBytes,
      status: 'uploading',
    };

    onProgress({ ...stats });

    // Pre-populate album cache if syncAlbums is enabled
    if (options.syncAlbums) {
      try {
        const existingAlbums = await getAllAlbums({});
        for (const album of existingAlbums) {
          this.albumCache.set(album.albumName.toLowerCase(), album.id);
        }
      } catch (err) {
        console.warn('Could not fetch existing albums for Takeout import:', err);
      }
    }

    // Process assets with concurrency
    const CONCURRENCY = 2;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < filteredAssets.length && !signal.aborted) {
        const index = nextIndex++;
        const asset = filteredAssets[index];

        stats.currentFileName = asset.fileName;
        onProgress({ ...stats });

        try {
          await this.uploadSingleAsset(asset, options, stats, signal);
        } catch (err) {
          if (signal.aborted) break;
          console.error(`Error uploading ${asset.fileName}:`, err);
          stats.errors++;
        } finally {
          stats.processed++;
          stats.bytesUploaded += asset.fileSize || 0;
          onProgress({ ...stats });
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, filteredAssets.length) }, () => worker());
    await Promise.all(workers);

    if (signal.aborted) {
      stats.status = 'cancelled';
    } else {
      stats.status = 'completed';
    }

    onProgress({ ...stats });
    return stats;
  }

  cancel() {
    this.abortController?.abort();
  }

  private async uploadSingleAsset(
    asset: MatchedTakeoutAsset,
    options: TakeoutImportOptions,
    stats: TakeoutUploadStats,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return;

    // 1. Extract file data as Blob from ZIP entry
    const blob = await asset.entry.getData(new zip.BlobWriter());
    if (!blob) {
      throw new Error(`Failed to extract data for ${asset.fileName}`);
    }

    if (signal.aborted) return;

    // Fix motion photo extensions (e.g. .mp -> .mp4, matching immich-go)
    let uploadName = asset.fileName;
    if (uploadName.toLowerCase().endsWith('.mp')) {
      uploadName = uploadName + '.mp4';
    }

    const captureDate = asset.captureDate || new Date();
    const file = new File([blob], uploadName, {
      lastModified: captureDate.getTime(),
    });

    const formData = new FormData();
    formData.append('fileCreatedAt', captureDate.toISOString());
    formData.append('fileModifiedAt', captureDate.toISOString());
    formData.append('isFavorite', options.syncFavorites && asset.isFavorite ? 'true' : 'false');
    formData.append('visibility', options.includeArchived && asset.isArchived ? 'archive' : 'timeline');
    formData.append('deviceAssetId', `takeout-${encodeURIComponent(asset.filePath)}-${asset.fileSize}`);
    formData.append('assetData', file);

    const queryParams = asQueryString(authManager.params);
    const url = getBaseUrl() + '/assets' + (queryParams ? `?${queryParams}` : '');

    const response = await uploadRequest<AssetMediaResponseDto>({
      url,
      data: formData,
    });

    if (response.status !== 200 && response.status !== 201) {
      throw new Error(`Upload failed with HTTP status ${response.status}`);
    }

    const result = response.data;
    const isDuplicate = result.status === AssetMediaStatus.Duplicate;

    if (isDuplicate) {
      stats.duplicates++;
    } else {
      stats.uploaded++;
    }

    const assetId = result.id;
    if (!assetId) return;

    // 2. Sync metadata (description, GPS) if not duplicate
    if (!isDuplicate && options.syncMetadata) {
      const hasDescription = !!asset.description?.trim();
      const hasGps =
        asset.latitude != null && asset.longitude != null && (asset.latitude !== 0 || asset.longitude !== 0);

      if (hasDescription || hasGps) {
        try {
          await updateAsset({
            id: assetId,
            updateAssetDto: {
              ...(hasDescription ? { description: asset.description } : {}),
              ...(hasGps ? { latitude: asset.latitude, longitude: asset.longitude } : {}),
            },
          });
        } catch (err) {
          console.warn(`Could not update metadata for asset ${assetId}:`, err);
        }
      }
    }

    // 3. Add to Albums if configured
    if (options.syncAlbums && asset.albumNames.length > 0) {
      for (const albumName of asset.albumNames) {
        if (!albumName.trim()) continue;
        try {
          const albumId = await this.getOrCreateAlbum(albumName, stats);
          if (albumId) {
            await addAssetsToAlbum({
              id: albumId,
              bulkIdsDto: { ids: [assetId] },
            });
          }
        } catch (err) {
          console.warn(`Failed adding asset ${assetId} to album "${albumName}":`, err);
        }
      }
    }
  }

  private async getOrCreateAlbum(albumName: string, stats: TakeoutUploadStats): Promise<string> {
    const key = albumName.trim().toLowerCase();
    const existing = this.albumCache.get(key);
    if (existing) {
      return existing;
    }

    const created: AlbumResponseDto = await createAlbum({
      createAlbumDto: {
        albumName: albumName.trim(),
      },
    });

    this.albumCache.set(key, created.id);
    stats.albumsCreated++;
    return created.id;
  }
}
