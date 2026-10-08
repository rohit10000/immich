/* eslint-disable tscompat/tscompat */
import { parseTakeoutArchives, type TakeoutScanResult } from '$lib/utils/takeout-parser';
import { TakeoutUploader, type TakeoutImportOptions, type TakeoutUploadStats } from '$lib/utils/takeout-uploader';

export class TakeoutImportManager {
  isOpen = $state(false);
  selectedFiles = $state<File[]>([]);
  scanResult = $state<TakeoutScanResult | null>(null);
  phase = $state<'idle' | 'scanning' | 'ready' | 'uploading' | 'completed' | 'cancelled' | 'error'>('idle');
  scanProgressText = $state('');

  options = $state<TakeoutImportOptions>({
    syncAlbums: true,
    syncFavorites: true,
    syncMetadata: true,
    skipTrashed: true,
    includeArchived: true,
    includeUnmatched: true,
  });

  stats = $state<TakeoutUploadStats>({
    total: 0,
    processed: 0,
    uploaded: 0,
    duplicates: 0,
    errors: 0,
    albumsCreated: 0,
    currentFileName: '',
    bytesUploaded: 0,
    totalBytes: 0,
    status: 'idle',
  });

  private uploader: TakeoutUploader | null = null;

  open() {
    this.isOpen = true;
  }

  close() {
    if (this.phase === 'uploading') {
      // Don't close if actively uploading without confirmation
      return;
    }
    this.isOpen = false;
  }

  forceClose() {
    if (this.phase === 'uploading') {
      this.cancel();
    }
    this.isOpen = false;
    this.reset();
  }

  addFiles(files: File[]) {
    const zipFiles: File[] = [];
    for (const file of files) {
      if (/\.zip$/i.test(file.name)) {
        zipFiles.push(file);
      }
    }
    if (zipFiles.length === 0) return;

    // Avoid duplicates by name + size
    for (const file of zipFiles) {
      const exists = this.selectedFiles.some(
        (f) => String(f.name) === String(file.name) && Number(f.size) === Number(file.size),
      );
      if (!exists) {
        this.selectedFiles.push(file);
      }
    }

    this.scanResult = null;
    this.phase = 'idle';
  }

  removeFile(index: number) {
    this.selectedFiles.splice(index, 1);
    this.scanResult = null;
    this.phase = 'idle';
  }

  clearFiles() {
    this.selectedFiles = [];
    this.scanResult = null;
    this.phase = 'idle';
  }

  async startScan() {
    if (this.selectedFiles.length === 0) return;

    this.phase = 'scanning';
    this.scanProgressText = 'Starting scan...';

    try {
      this.scanResult = await parseTakeoutArchives(this.selectedFiles, (current, total, phaseName) => {
        this.scanProgressText = total > 0 ? `${phaseName} (${current} / ${total})` : phaseName;
      });
      this.phase = 'ready';
    } catch (err) {
      console.error('Error scanning Google Takeout archives:', err);
      this.phase = 'error';
      this.stats.errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  async startImport() {
    if (!this.scanResult || this.scanResult.assets.length === 0) return;

    this.phase = 'uploading';
    this.uploader = new TakeoutUploader();

    try {
      this.stats = await this.uploader.upload(this.scanResult.assets, this.options, (updatedStats) => {
        this.stats = updatedStats;
      });
      this.phase = this.stats.status === 'cancelled' ? 'cancelled' : 'completed';
    } catch (err) {
      console.error('Error importing Takeout assets:', err);
      this.phase = 'error';
      this.stats.errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  cancel() {
    this.uploader?.cancel();
    this.phase = 'cancelled';
  }

  reset() {
    this.selectedFiles = [];
    this.scanResult = null;
    this.phase = 'idle';
    this.scanProgressText = '';
    this.stats = {
      total: 0,
      processed: 0,
      uploaded: 0,
      duplicates: 0,
      errors: 0,
      albumsCreated: 0,
      currentFileName: '',
      bytesUploaded: 0,
      totalBytes: 0,
      status: 'idle',
    };
  }
}

export const takeoutImportManager = new TakeoutImportManager();
