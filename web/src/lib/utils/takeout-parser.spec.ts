import * as zip from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { isMediaFile, parsePhotoTakenTime, parseTakeoutArchives } from './takeout-parser';

describe('takeout-parser', () => {
  describe('isMediaFile', () => {
    it('should identify supported photo formats', () => {
      expect(isMediaFile('photo.jpg')).toBe(true);
      expect(isMediaFile('photo.JPEG')).toBe(true);
      expect(isMediaFile('photo.png')).toBe(true);
      expect(isMediaFile('photo.HEIC')).toBe(true);
      expect(isMediaFile('photo.dng')).toBe(true);
    });

    it('should identify supported video formats and motion photos', () => {
      expect(isMediaFile('video.mp4')).toBe(true);
      expect(isMediaFile('video.MOV')).toBe(true);
      expect(isMediaFile('motion_photo.mp')).toBe(true);
    });

    it('should reject non-media files', () => {
      expect(isMediaFile('metadata.json')).toBe(false);
      expect(isMediaFile('.DS_Store')).toBe(false);
      expect(isMediaFile('notes.txt')).toBe(false);
      expect(isMediaFile('archive_browser.html')).toBe(false);
    });
  });

  describe('parsePhotoTakenTime', () => {
    it('should convert epoch string to Date', () => {
      const date = parsePhotoTakenTime({
        photoTakenTime: {
          timestamp: '1696809600', // 2023-10-09T00:00:00.000Z
        },
      });

      expect(date).toBeDefined();
      expect(date?.getUTCFullYear()).toBe(2023);
      expect(date?.getUTCMonth()).toBe(9); // October
    });

    it('should return undefined if timestamp is missing or zero', () => {
      expect(parsePhotoTakenTime(undefined)).toBeUndefined();
      expect(parsePhotoTakenTime({})).toBeUndefined();
      expect(parsePhotoTakenTime({ photoTakenTime: { timestamp: '0' } })).toBeUndefined();
    });
  });

  describe('parseTakeoutArchives with zip data', () => {
    it('should parse zip archive, match metadata, and detect albums', async () => {
      // Build a test ZIP in memory using @zip.js/zip.js
      const zipWriter = new zip.ZipWriter(new zip.BlobWriter());

      // 1. Album metadata
      const albumJson = JSON.stringify({
        title: 'Summer Trip',
        description: 'Trip to Italy',
      });
      await zipWriter.add('Takeout/Google Photos/Summer Trip/metadata.json', new zip.TextReader(albumJson));

      // 2. Photo with JSON sidecar in album
      const photoMeta = JSON.stringify({
        title: 'IMG_20230715_123456.jpg',
        description: 'Colosseum in Rome',
        photoTakenTime: { timestamp: '1689424496' },
        geoData: { latitude: 41.8902, longitude: 12.4922, altitude: 20 },
        favorited: true,
      });
      await zipWriter.add(
        'Takeout/Google Photos/Summer Trip/IMG_20230715_123456.jpg',
        new zip.Uint8ArrayReader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
      );
      await zipWriter.add(
        'Takeout/Google Photos/Summer Trip/IMG_20230715_123456.jpg.json',
        new zip.TextReader(photoMeta),
      );

      // 3. Numbered photo duplicate matching normal matcher
      const photo2Meta = JSON.stringify({
        title: 'PXL_20220101(1).jpg',
        photoTakenTime: { timestamp: '1641038400' },
      });
      await zipWriter.add(
        'Takeout/Google Photos/Photos from 2022/PXL_20220101(1).jpg',
        new zip.Uint8ArrayReader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
      );
      await zipWriter.add(
        'Takeout/Google Photos/Photos from 2022/PXL_20220101.jpg(1).json',
        new zip.TextReader(photo2Meta),
      );

      // 4. Close zip writer and convert blob to File
      const zipBlob = await zipWriter.close();
      const testZipFile = new File([zipBlob], 'takeout-test.zip', { type: 'application/zip' });

      // Run parsing
      const result = await parseTakeoutArchives([testZipFile]);

      expect(result.totalMediaFiles).toBe(2);
      expect(result.matchedCount).toBe(2);
      expect(result.assets.length).toBe(2);

      // Check album detection
      expect(result.albums.size).toBe(1);
      const album = Array.from(result.albums.values())[0];
      expect(album.title).toBe('Summer Trip');
      expect(album.description).toBe('Trip to Italy');

      // Check asset 1 metadata
      const asset1 = result.assets.find((a) => a.fileName.includes('IMG_20230715'));
      expect(asset1).toBeDefined();
      expect(asset1?.description).toBe('Colosseum in Rome');
      expect(asset1?.isFavorite).toBe(true);
      expect(asset1?.latitude).toBeCloseTo(41.8902);
      expect(asset1?.longitude).toBeCloseTo(12.4922);
      expect(asset1?.albumNames).toContain('Summer Trip');

      // Check asset 2 (year folder, not an album)
      const asset2 = result.assets.find((a) => a.fileName.includes('PXL_20220101'));
      expect(asset2).toBeDefined();
      expect(asset2?.albumNames.length).toBe(0);
    });
  });
});
