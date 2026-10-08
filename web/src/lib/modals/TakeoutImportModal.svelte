<script lang="ts">
  import { goto } from '$app/navigation';
  import { takeoutImportManager } from '$lib/managers/takeout-import-manager.svelte';
  import { Route } from '$lib/route';
  import {
    Alert,
    Badge,
    Button,
    FormatBytes,
    Icon,
    IconButton,
    LoadingSpinner,
    Modal,
    ModalBody,
    ModalFooter,
    ProgressBar,
    Switch,
  } from '@immich/ui';
  import {
    mdiAlertCircle,
    mdiArchiveOutline,
    mdiCheckCircle,
    mdiClose,
    mdiDeleteOutline,
    mdiFolderMultipleOutline,
    mdiFolderZipOutline,
    mdiImageMultipleOutline,
    mdiMapMarkerOutline,
    mdiPlus,
    mdiStarOutline,
    mdiTrayArrowUp,
  } from '@mdi/js';
  import { siGooglephotos } from 'simple-icons';
  import { t } from 'svelte-i18n';

  let isDragging = $state(false);
  let fileInputRef: HTMLInputElement | null = $state(null);

  const manager = takeoutImportManager;

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    isDragging = true;
  };

  const handleDragLeave = () => {
    isDragging = false;
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files) {
      manager.addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      manager.addFiles(Array.from(target.files));
      target.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef?.click();
  };

  const percentProgress = $derived(
    manager.stats.total > 0 ? Math.floor((manager.stats.processed / manager.stats.total) * 100) : 0,
  );
</script>

{#if manager.isOpen}
  <Modal title="Google Photos Takeout Import" onClose={() => manager.forceClose()} class="max-w-2xl w-full">
    <ModalBody>
      <!-- STATE 1: IDLE / FILE SELECTION -->
      {#if manager.phase === 'idle'}
        <div class="flex flex-col gap-5">
          <!-- Header Banner -->
          <div class="flex items-center gap-3 rounded-xl bg-primary/10 p-4 border border-primary/20">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
              <Icon icon={siGooglephotos.path} size="1.75rem" />
            </div>
            <div class="flex-1 text-sm">
              <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100">Migrate Google Photos Takeout</h3>
              <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                Upload your Google Takeout ZIP archive(s). We'll automatically restore albums, capture dates, GPS
                locations, and descriptions.
              </p>
            </div>
          </div>

          <!-- Drag and Drop Dropzone -->
          <button
            type="button"
            class="w-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition-all cursor-pointer
              {isDragging
              ? 'border-primary bg-primary/5 dark:bg-primary/10 scale-[0.99]'
              : 'border-gray-300 hover:border-primary/60 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40'}"
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            onclick={triggerFileInput}
          >
            <input
              type="file"
              accept=".zip"
              multiple
              class="hidden"
              bind:this={fileInputRef}
              onchange={handleFileChange}
            />

            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
              <Icon icon={mdiFolderZipOutline} size="2.2rem" />
            </div>

            <p class="font-medium text-sm text-gray-800 dark:text-gray-200">
              Drag & drop your Google Takeout ZIP files here
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Supports multi-part archives (e.g. <span class="font-mono text-[11px]">takeout-*.zip</span>)
            </p>

            <Button
              variant="outline"
              size="small"
              color="primary"
              class="mt-3.5 pointer-events-none"
              leadingIcon={mdiPlus}
            >
              Browse Files
            </Button>
          </button>

          <!-- Selected Files List -->
          {#if manager.selectedFiles.length > 0}
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400">
                <span>Selected ZIP Archives ({manager.selectedFiles.length})</span>
                <button
                  type="button"
                  class="text-red-500 hover:underline cursor-pointer"
                  onclick={() => manager.clearFiles()}
                >
                  Clear all
                </button>
              </div>

              <div class="flex max-h-36 flex-col gap-1.5 overflow-y-auto pr-1">
                {#each manager.selectedFiles as file, index}
                  <div
                    class="flex items-center justify-between rounded-lg bg-gray-100 dark:bg-gray-800/80 px-3 py-2 text-xs"
                  >
                    <div class="flex items-center gap-2 truncate">
                      <Icon icon={mdiFolderZipOutline} size="1.1rem" class="text-primary shrink-0" />
                      <span class="font-medium truncate text-gray-800 dark:text-gray-200">{file.name}</span>
                      <span class="text-gray-400 shrink-0">
                        (<FormatBytes bytes={file.size} />)
                      </span>
                    </div>
                    <IconButton
                      icon={mdiClose}
                      size="small"
                      variant="ghost"
                      color="secondary"
                      title="Remove file"
                      aria-label="Remove file"
                      onclick={(e: MouseEvent) => {
                        e.stopPropagation();
                        manager.removeFile(index);
                      }}
                    />
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Options Toggles -->
          <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-800/20 p-3.5">
            <h4 class="font-semibold text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2.5">
              Import Configuration
            </h4>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <Icon icon={mdiFolderMultipleOutline} size="1rem" class="text-primary shrink-0" />
                  <div>
                    <div class="font-medium text-gray-800 dark:text-gray-200">Sync Albums</div>
                    <div class="text-[10px] text-gray-500">Recreate Google Photos albums</div>
                  </div>
                </div>
                <Switch bind:checked={manager.options.syncAlbums} />
              </label>

              <label
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <Icon icon={mdiStarOutline} size="1rem" class="text-amber-500 shrink-0" />
                  <div>
                    <div class="font-medium text-gray-800 dark:text-gray-200">Preserve Favorites</div>
                    <div class="text-[10px] text-gray-500">Keep starred photos favorite</div>
                  </div>
                </div>
                <Switch bind:checked={manager.options.syncFavorites} />
              </label>

              <label
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <Icon icon={mdiMapMarkerOutline} size="1rem" class="text-emerald-500 shrink-0" />
                  <div>
                    <div class="font-medium text-gray-800 dark:text-gray-200">GPS & Descriptions</div>
                    <div class="text-[10px] text-gray-500">Restore captions and coordinates</div>
                  </div>
                </div>
                <Switch bind:checked={manager.options.syncMetadata} />
              </label>

              <label
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <Icon icon={mdiDeleteOutline} size="1rem" class="text-rose-500 shrink-0" />
                  <div>
                    <div class="font-medium text-gray-800 dark:text-gray-200">Skip Trashed</div>
                    <div class="text-[10px] text-gray-500">Ignore items in Google trash</div>
                  </div>
                </div>
                <Switch bind:checked={manager.options.skipTrashed} />
              </label>

              <label
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <Icon icon={mdiArchiveOutline} size="1rem" class="text-indigo-500 shrink-0" />
                  <div>
                    <div class="font-medium text-gray-800 dark:text-gray-200">Include Archived</div>
                    <div class="text-[10px] text-gray-500">Import archived photos</div>
                  </div>
                </div>
                <Switch bind:checked={manager.options.includeArchived} />
              </label>

              <label
                class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 cursor-pointer"
              >
                <div class="flex items-center gap-2">
                  <Icon icon={mdiImageMultipleOutline} size="1rem" class="text-cyan-500 shrink-0" />
                  <div>
                    <div class="font-medium text-gray-800 dark:text-gray-200">Include Unmatched</div>
                    <div class="text-[10px] text-gray-500">Import files without JSON</div>
                  </div>
                </div>
                <Switch bind:checked={manager.options.includeUnmatched} />
              </label>
            </div>
          </div>
        </div>

        <!-- STATE 2: SCANNING -->
      {:else if manager.phase === 'scanning'}
        <div class="flex flex-col items-center justify-center py-12 text-center gap-4">
          <LoadingSpinner size="large" class="text-primary" />
          <div>
            <h3 class="font-semibold text-base text-gray-900 dark:text-gray-100">
              Analyzing Google Takeout Archives...
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {manager.scanProgressText || 'Reading archive index and solving metadata puzzles...'}
            </p>
          </div>
        </div>

        <!-- STATE 3: READY / PREVIEW -->
      {:else if manager.phase === 'ready' && manager.scanResult}
        <div class="flex flex-col gap-4">
          <div
            class="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-3"
          >
            <Icon icon={mdiCheckCircle} size="1.5rem" class="text-emerald-500 shrink-0" />
            <div>
              <span class="font-semibold">Analysis Complete!</span>
              <p class="text-xs opacity-90 mt-0.5">Ready to import into your Immich library. Review details below.</p>
            </div>
          </div>

          <!-- Summary Grid -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div class="rounded-xl bg-gray-100 dark:bg-gray-800/60 p-3">
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {manager.scanResult.totalMediaFiles.toLocaleString()}
              </div>
              <div class="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Media Files</div>
            </div>

            <div class="rounded-xl bg-gray-100 dark:bg-gray-800/60 p-3">
              <div class="text-lg font-bold text-primary">
                {manager.scanResult.matchedCount.toLocaleString()}
              </div>
              <div class="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Matched Metadata</div>
            </div>

            <div class="rounded-xl bg-gray-100 dark:bg-gray-800/60 p-3">
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                {manager.scanResult.albums.size}
              </div>
              <div class="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Albums Found</div>
            </div>

            <div class="rounded-xl bg-gray-100 dark:bg-gray-800/60 p-3">
              <div class="text-lg font-bold text-gray-900 dark:text-gray-100">
                <FormatBytes bytes={manager.scanResult.totalSizeBytes} />
              </div>
              <div class="text-[11px] text-gray-500 uppercase tracking-wider mt-0.5">Total Size</div>
            </div>
          </div>

          <!-- Album list preview if any -->
          {#if manager.scanResult.albums.size > 0}
            <div class="rounded-xl border border-gray-200 dark:border-gray-800 p-3.5 bg-gray-50/50 dark:bg-gray-800/30">
              <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Albums to be synced ({manager.scanResult.albums.size}):
              </div>
              <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {#each Array.from(manager.scanResult.albums.values()) as album}
                  <Badge color="secondary" size="small">
                    {album.title}
                  </Badge>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- STATE 4: UPLOADING -->
      {:else if manager.phase === 'uploading'}
        <div class="flex flex-col gap-5 py-2">
          <div>
            <div class="flex justify-between items-center text-sm font-semibold mb-1 text-gray-800 dark:text-gray-200">
              <span>Importing Takeout Assets...</span>
              <span class="text-primary font-bold">{percentProgress}%</span>
            </div>
            <ProgressBar value={percentProgress} max={100} class="h-2.5 rounded-full" />
            <div class="flex justify-between text-xs text-gray-500 mt-1.5 truncate">
              <span class="truncate"
                >Current: <span class="font-mono text-[11px] text-gray-700 dark:text-gray-300"
                  >{manager.stats.currentFileName || 'Processing...'}</span
                ></span
              >
              <span class="shrink-0 font-medium">
                {manager.stats.processed.toLocaleString()} / {manager.stats.total.toLocaleString()}
              </span>
            </div>
          </div>

          <!-- Realtime metrics -->
          <div class="grid grid-cols-4 gap-2.5 text-center">
            <div class="rounded-xl bg-emerald-500/10 p-2.5 border border-emerald-500/20">
              <div class="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {manager.stats.uploaded.toLocaleString()}
              </div>
              <div class="text-[10px] text-gray-500 uppercase tracking-wider">Uploaded</div>
            </div>

            <div class="rounded-xl bg-amber-500/10 p-2.5 border border-amber-500/20">
              <div class="text-base font-bold text-amber-600 dark:text-amber-400">
                {manager.stats.duplicates.toLocaleString()}
              </div>
              <div class="text-[10px] text-gray-500 uppercase tracking-wider">Duplicates</div>
            </div>

            <div class="rounded-xl bg-primary/10 p-2.5 border border-primary/20">
              <div class="text-base font-bold text-primary">
                {manager.stats.albumsCreated.toLocaleString()}
              </div>
              <div class="text-[10px] text-gray-500 uppercase tracking-wider">Albums</div>
            </div>

            <div class="rounded-xl bg-rose-500/10 p-2.5 border border-rose-500/20">
              <div class="text-base font-bold text-rose-600 dark:text-rose-400">
                {manager.stats.errors.toLocaleString()}
              </div>
              <div class="text-[10px] text-gray-500 uppercase tracking-wider">Errors</div>
            </div>
          </div>
        </div>

        <!-- STATE 5: COMPLETED -->
      {:else if manager.phase === 'completed'}
        <div class="flex flex-col items-center justify-center py-6 text-center gap-4">
          <div
            class="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
          >
            <Icon icon={mdiCheckCircle} size="3rem" />
          </div>

          <div>
            <h3 class="font-bold text-lg text-gray-900 dark:text-gray-100">Import Completed Successfully!</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Your Google Photos Takeout has been migrated to Immich with original dates and albums.
            </p>
          </div>

          <!-- Final Summary Card -->
          <div class="grid grid-cols-3 gap-3 w-full max-w-md">
            <div class="rounded-xl bg-gray-100 dark:bg-gray-800 p-3">
              <div class="text-base font-bold text-emerald-500">{manager.stats.uploaded.toLocaleString()}</div>
              <div class="text-[10px] text-gray-500 uppercase tracking-wider">Imported</div>
            </div>
            <div class="rounded-xl bg-gray-100 dark:bg-gray-800 p-3">
              <div class="text-base font-bold text-amber-500">{manager.stats.duplicates.toLocaleString()}</div>
              <div class="text-[10px] text-gray-500 uppercase tracking-wider">Duplicates</div>
            </div>
            <div class="rounded-xl bg-gray-100 dark:bg-gray-800 p-3">
              <div class="text-base font-bold text-primary">{manager.stats.albumsCreated.toLocaleString()}</div>
              <div class="text-[10px] text-gray-500 uppercase tracking-wider">Albums</div>
            </div>
          </div>
        </div>

        <!-- STATE 6: ERROR OR CANCELLED -->
      {:else if manager.phase === 'error' || manager.phase === 'cancelled'}
        <div class="flex flex-col items-center justify-center py-6 text-center gap-3">
          <div
            class="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400"
          >
            <Icon icon={mdiAlertCircle} size="2.5rem" />
          </div>
          <div>
            <h3 class="font-bold text-base text-gray-900 dark:text-gray-100">
              {manager.phase === 'cancelled' ? 'Import Cancelled' : 'Import Error'}
            </h3>
            <p class="text-xs text-rose-500 mt-1 max-w-md">
              {manager.stats.errorMessage || 'An issue occurred during Takeout processing.'}
            </p>
          </div>
        </div>
      {/if}
    </ModalBody>

    <ModalFooter>
      {#if manager.phase === 'idle'}
        <Button variant="ghost" color="secondary" onclick={() => manager.forceClose()}>Cancel</Button>
        <Button
          color="primary"
          leadingIcon={mdiTrayArrowUp}
          disabled={manager.selectedFiles.length === 0}
          onclick={() => manager.startScan()}
        >
          Analyze Archives
        </Button>
      {:else if manager.phase === 'ready'}
        <Button
          variant="ghost"
          color="secondary"
          onclick={() => {
            manager.phase = 'idle';
          }}
        >
          Back
        </Button>
        <Button color="primary" leadingIcon={mdiTrayArrowUp} onclick={() => manager.startImport()}>Start Import</Button>
      {:else if manager.phase === 'uploading'}
        <Button color="danger" variant="outline" onclick={() => manager.cancel()}>Stop Import</Button>
      {:else if manager.phase === 'completed'}
        {#if manager.stats.albumsCreated > 0}
          <Button
            variant="outline"
            color="secondary"
            leadingIcon={mdiFolderMultipleOutline}
            onclick={() => {
              manager.forceClose();
              goto(Route.albums());
            }}
          >
            View Albums
          </Button>
        {/if}
        <Button color="primary" onclick={() => manager.forceClose()}>Done</Button>
      {:else if manager.phase === 'error' || manager.phase === 'cancelled'}
        <Button variant="ghost" color="secondary" onclick={() => manager.forceClose()}>Close</Button>
        <Button
          color="primary"
          onclick={() => {
            manager.phase = 'idle';
          }}
        >
          Try Again
        </Button>
      {/if}
    </ModalFooter>
  </Modal>
{/if}
