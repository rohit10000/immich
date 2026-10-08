/* eslint-disable tscompat/tscompat */
import * as zip from '@zip.js/zip.js';

export interface GoogleTimeObject {
  timestamp?: string;
  formatted?: string;
}

export interface GoogleGeoData {
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface GoogleEnrichment {
  text?: string;
  latitude?: number;
  longitude?: number;
}

export interface GooglePerson {
  name: string;
}

export interface GooglePhotosMetadata {
  title?: string;
  description?: string;
  category?: string;
  photoTakenTime?: GoogleTimeObject;
  creationTime?: GoogleTimeObject;
  modificationTime?: GoogleTimeObject;
  geoData?: GoogleGeoData;
  geoDataExif?: GoogleGeoData;
  trashed?: boolean;
  archived?: boolean;
  favorited?: boolean;
  enrichments?: GoogleEnrichment[];
  people?: GooglePerson[];
  googlePhotosOrigin?: {
    fromPartnerSharing?: boolean | Record<string, unknown>;
  };
}

export interface AlbumDefinition {
  title: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  dirPath: string;
}

export interface MatchedTakeoutAsset {
  zipFile: File;
  entry: zip.FileEntry;
  fileName: string;
  filePath: string;
  dirPath: string;
  fileSize: number;
  metadata?: GooglePhotosMetadata;
  captureDate?: Date;
  description?: string;
  latitude?: number;
  longitude?: number;
  isFavorite?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  albumNames: string[];
}

export interface TakeoutScanResult {
  assets: MatchedTakeoutAsset[];
  albums: Map<string, AlbumDefinition>;
  totalFiles: number;
  totalMediaFiles: number;
  matchedCount: number;
  unmatchedCount: number;
  totalSizeBytes: number;
}

// Common media file extensions supported by Immich
const SUPPORTED_IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.heic',
  '.heif',
  '.webp',
  '.gif',
  '.tif',
  '.tiff',
  '.dng',
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.rw2',
  '.orf',
  '.raf',
  '.pef',
  '.bmp',
  '.avif',
  '.svg',
  '.raw',
]);

const SUPPORTED_VIDEO_EXTS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.mkv',
  '.avi',
  '.wmv',
  '.webm',
  '.flv',
  '.3gp',
  '.3g2',
  '.mts',
  '.m2ts',
  '.ts',
  '.mpg',
  '.mpeg',
  '.mp',
]);

// Banned junk files (replicated from immich-go shared.DefaultBannedFiles)
const BANNED_FILE_PATTERNS = [
  /^\.ds_store$/i,
  /^desktop\.ini$/i,
  /^thumbs\.db$/i,
  /^\.spotlight-v100/i,
  /print-subscriptions\.json$/i,
  /shared_album_comments\.json$/i,
  /user-generated-memory-titles\.json$/i,
  /archive_browser\.html$/i,
  /\.tmp$/i,
  /^\._/i,
];

function isBannedFile(name: string): boolean {
  const base = name.split('/').pop() || name;
  return BANNED_FILE_PATTERNS.some((pattern) => pattern.test(base));
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

export function isMediaFile(filename: string): boolean {
  const ext = getExtension(filename);
  return SUPPORTED_IMAGE_EXTS.has(ext) || SUPPORTED_VIDEO_EXTS.has(ext);
}

// Normalizes path: removes leading/trailing slashes
function normalizePath(p: string): string {
  return p.replace(/^\/+|\/+$/g, '');
}

// Extracts directory and filename from an archive entry path
function splitPath(fullPath: string): { dir: string; base: string } {
  const clean = normalizePath(fullPath);
  const idx = clean.lastIndexOf('/');
  if (idx >= 0) {
    return { dir: clean.slice(0, idx), base: clean.slice(idx + 1) };
  }
  return { dir: '', base: clean };
}

// Replicates immich-go: getFileIndex
// e.g. "IMG_1234(1).jpg" -> base: "IMG_1234.jpg", index: "1"
function getFileIndex(name: string): { base: string; index: string } {
  const p1 = name.lastIndexOf('(');
  if (p1 >= 0) {
    const p2 = name.lastIndexOf(')');
    if (p2 > p1) {
      const idx = name.slice(p1 + 1, p2);
      if (!isNaN(Number(idx))) {
        return { base: name.slice(0, p1) + name.slice(p2 + 1), index: idx };
      }
    }
  }
  return { base: name, index: '' };
}

// Matchers corresponding to immich-go matcher functions

// 1. matchFastTrack: exact filename match (minus .json)
function matchFastTrack(jsonName: string, fileName: string): boolean {
  const jsonBase = jsonName.replace(/\.json$/i, '');
  return jsonBase.toLowerCase() === fileName.toLowerCase();
}

// 2. matchNormal: handles index numbering, supplemental-metadata, and 46-char truncation
function matchNormal(jsonName: string, fileName: string): boolean {
  const { base: fileBase, index: fileIdx } = getFileIndex(fileName);
  const { base: rawJsonBase, index: jsonIdx } = getFileIndex(jsonName);

  if (fileIdx !== jsonIdx) {
    return false;
  }

  let jsonBase = rawJsonBase;
  // Strip supplemental-metadata
  jsonBase = jsonBase.replace(/\.supplemental-metadata(?=\.json$|$)/i, '');
  jsonBase = jsonBase.replace(/\.json$/i, '');

  if (jsonBase.toLowerCase() === fileBase.toLowerCase()) {
    return true;
  }

  // Google Photos truncates filenames longer than 46 runes / UTF-16 characters
  if (fileBase.length > 46) {
    const runes = Array.from(fileBase);
    if (runes.length > 46) {
      const truncated = runes.slice(0, 46).join('');
      if (truncated.toLowerCase() === jsonBase.toLowerCase()) {
        return true;
      }
    }
    const extIdx = fileBase.lastIndexOf('.');
    const withoutExt = extIdx > 0 ? fileBase.slice(0, extIdx) : fileBase;
    const shorter = Array.from(withoutExt).slice(0, -1).join('');
    if (shorter.toLowerCase() === jsonBase.toLowerCase()) {
      return true;
    }
  }

  return false;
}

// 3. matchEditedName: handles photos edited in Google Photos (e.g. -edited, -modifié)
function matchEditedName(jsonName: string, fileName: string): boolean {
  if (getFileIndex(fileName).index !== '') {
    return false;
  }
  let base = jsonName.replace(/\.json$/i, '');
  base = base.replace(/\.supplemental-metadata$/i, '');

  const extIdx = base.lastIndexOf('.');
  if (extIdx > 0) {
    base = base.slice(0, extIdx);
  }
  const fileExtIdx = fileName.lastIndexOf('.');
  const fileWithoutExt = fileExtIdx > 0 ? fileName.slice(0, fileExtIdx) : fileName;

  return fileWithoutExt.toLowerCase().startsWith(base.toLowerCase());
}

// 4. matchForgottenDuplicates: handles duplicate naming variations
function matchForgottenDuplicates(jsonName: string, fileName: string): boolean {
  const jsonBase = jsonName.replace(/\.json$/i, '');
  const fileExtIdx = fileName.lastIndexOf('.');
  const fileWithoutExt = fileExtIdx > 0 ? fileName.slice(0, fileExtIdx) : fileName;

  if (fileWithoutExt.toLowerCase().startsWith(jsonBase.toLowerCase())) {
    const diff = Math.abs(Array.from(fileWithoutExt).length - Array.from(jsonBase).length);
    if (diff < 10) {
      return true;
    }
  }
  return false;
}

const MATCHERS = [
  { name: 'FastTrack', fn: matchFastTrack },
  { name: 'Normal', fn: matchNormal },
  { name: 'EditedName', fn: matchEditedName },
  { name: 'ForgottenDuplicates', fn: matchForgottenDuplicates },
];

// Checks if a folder name is a standard Takeout timeline / year folder
// rather than a user album
function isYearOrSystemFolder(folderName: string): boolean {
  const name = folderName.trim().toLowerCase();
  if (!name || name === 'takeout' || name === 'google photos' || name === 'google fotos' || name === 'google foto') {
    return true;
  }
  if (name === 'trash' || name === 'bin' || name === 'archive') {
    return true;
  }
  // Matches "Photos from 2023", "Fotos de 2022", "Fotos von 2021", "2023-05-12", etc.
  if (/^(photos from|fotos de|fotos von|fotos do|photos de|bilder von)\s+\d{4}/i.test(name)) {
    return true;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) {
    return true;
  }
  return false;
}

// Parses timestamp from Google Photos metadata
export function parsePhotoTakenTime(meta?: GooglePhotosMetadata): Date | undefined {
  if (!meta) return undefined;

  const tsStr = meta.photoTakenTime?.timestamp || meta.creationTime?.timestamp;
  if (tsStr && tsStr !== '0') {
    const ts = parseInt(tsStr, 10);
    if (!isNaN(ts) && ts > 0) {
      return new Date(ts * 1000);
    }
  }
  return undefined;
}

interface RawCatalogItem {
  zipFile: File;
  entry: zip.FileEntry;
  base: string;
  dir: string;
}

/**
 * Parses one or more Google Takeout ZIP files, solves metadata associations,
 * and extracts albums and assets ready for Immich upload.
 */
export async function parseTakeoutArchives(
  zipFiles: File[],
  onProgress?: (scannedFiles: number, totalFilesEstimate: number, currentPhase: string) => void,
): Promise<TakeoutScanResult> {
  const catalogsByDir = new Map<
    string,
    {
      media: Map<string, RawCatalogItem>;
      jsons: Map<string, { item: RawCatalogItem; data?: GooglePhotosMetadata }>;
    }
  >();

  const albumsByDir = new Map<string, AlbumDefinition>();
  let totalEntriesCount = 0;
  let totalMediaCount = 0;
  let totalBytes = 0;

  // PASS 1: Read central directories and catalog all entries
  onProgress?.(0, 0, 'Scanning ZIP index...');

  for (const zipFile of zipFiles) {
    totalBytes += zipFile.size;
    const zipReader = new zip.ZipReader(new zip.BlobReader(zipFile));

    try {
      const entries = await zipReader.getEntries();
      totalEntriesCount += entries.length;

      for (const entry of entries) {
        if (entry.directory || isBannedFile(entry.filename)) {
          continue;
        }

        const fileEntry = entry as zip.FileEntry;
        const { dir, base } = splitPath(fileEntry.filename);
        let catalog = catalogsByDir.get(dir);
        if (!catalog) {
          catalog = { media: new Map(), jsons: new Map() };
          catalogsByDir.set(dir, catalog);
        }

        const ext = getExtension(base);
        if (ext === '.json') {
          catalog.jsons.set(base, { item: { zipFile, entry: fileEntry, base, dir } });
        } else if (isMediaFile(base)) {
          totalMediaCount++;
          catalog.media.set(base, { zipFile, entry: fileEntry, base, dir });
        }
      }
    } finally {
      await zipReader.close();
    }
  }

  // PASS 1.5: Read JSON metadata content
  onProgress?.(0, totalMediaCount, 'Parsing metadata files...');
  let jsonParsedCount = 0;

  for (const [dir, catalog] of catalogsByDir.entries()) {
    for (const [jsonName, jsonEntry] of catalog.jsons.entries()) {
      try {
        const text = await jsonEntry.item.entry.getData(new zip.TextWriter('utf-8'));
        if (text) {
          const parsed = JSON.parse(text) as GooglePhotosMetadata;
          jsonEntry.data = parsed;

          // Check if this is an album metadata file (e.g. metadata.json in an album directory)
          const isAlbumJson =
            (jsonName.toLowerCase() === 'metadata.json' || !parsed.photoTakenTime?.timestamp) &&
            !!parsed.title &&
            !isYearOrSystemFolder(parsed.title);

          if (isAlbumJson) {
            const enrich = parsed.enrichments?.[0];
            albumsByDir.set(dir, {
              title: parsed.title || dir.split('/').pop() || 'Untitled Album',
              description: parsed.description || enrich?.text,
              latitude: enrich?.latitude,
              longitude: enrich?.longitude,
              dirPath: dir,
            });
          }
        }
      } catch (err) {
        // Skip malformed JSONs
      }

      jsonParsedCount++;
      if (jsonParsedCount % 50 === 0) {
        onProgress?.(jsonParsedCount, totalMediaCount, 'Parsing metadata files...');
      }
    }

    // If directory is not a system/year folder and not registered as album yet,
    // consider the folder name as an album name if it contains media files
    if (catalog.media.size > 0 && !albumsByDir.has(dir)) {
      const folderName = dir.split('/').pop() || '';
      if (folderName && !isYearOrSystemFolder(folderName)) {
        albumsByDir.set(dir, {
          title: folderName,
          dirPath: dir,
        });
      }
    }
  }

  // PASS 2: Puzzle Solver (Associate Media Files with Metadata)
  onProgress?.(0, totalMediaCount, 'Matching photos with metadata...');
  const matchedAssets: MatchedTakeoutAsset[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const [dir, catalog] of catalogsByDir.entries()) {
    const unMatchedMedia = new Map(catalog.media);
    const dirJsons = Array.from(catalog.jsons.entries());

    // Apply matchers in order of specificity
    for (const matcher of MATCHERS) {
      for (const [jsonName, jsonHolder] of dirJsons) {
        if (!jsonHolder.data) continue;

        for (const [mediaName, mediaItem] of unMatchedMedia.entries()) {
          if (matcher.fn(jsonName, mediaName)) {
            const meta = jsonHolder.data;
            const captureDate = parsePhotoTakenTime(meta);
            const album = albumsByDir.get(dir);
            const albumNames = album ? [album.title] : [];

            // Inherit GPS from album if photo lacks GPS
            let lat = meta.geoDataExif?.latitude ?? meta.geoData?.latitude;
            let lon = meta.geoDataExif?.longitude ?? meta.geoData?.longitude;
            if ((!lat || lat === 0) && (!lon || lon === 0) && album?.latitude && album?.longitude) {
              lat = album.latitude;
              lon = album.longitude;
            }

            matchedAssets.push({
              zipFile: mediaItem.zipFile,
              entry: mediaItem.entry,
              fileName: meta.title || mediaItem.base,
              filePath: mediaItem.entry.filename,
              dirPath: dir,
              fileSize: mediaItem.entry.uncompressedSize,
              metadata: meta,
              captureDate,
              description: meta.description,
              latitude: lat,
              longitude: lon,
              isFavorite: !!meta.favorited,
              isArchived: !!meta.archived,
              isTrashed: !!meta.trashed,
              albumNames,
            });

            matchedCount++;
            unMatchedMedia.delete(mediaName);
          }
        }
      }
    }

    // Media files without matching JSON metadata
    for (const [, mediaItem] of unMatchedMedia.entries()) {
      const album = albumsByDir.get(dir);
      const albumNames = album ? [album.title] : [];

      matchedAssets.push({
        zipFile: mediaItem.zipFile,
        entry: mediaItem.entry,
        fileName: mediaItem.base,
        filePath: mediaItem.entry.filename,
        dirPath: dir,
        fileSize: mediaItem.entry.uncompressedSize,
        albumNames,
      });
      unmatchedCount++;
    }
  }

  return {
    assets: matchedAssets,
    albums: albumsByDir,
    totalFiles: totalEntriesCount,
    totalMediaFiles: totalMediaCount,
    matchedCount,
    unmatchedCount,
    totalSizeBytes: totalBytes,
  };
}
