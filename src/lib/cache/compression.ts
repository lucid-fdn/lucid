import { COMPRESSION } from './config';
import { CacheKey } from './config';
import { shouldCompress } from './config';

/**
 * Utility for compressing and decompressing cache data
 */
export class CacheCompression {
  /**
   * Compresses data if it exceeds the size threshold
   */
  static compress<T>(data: T, key?: CacheKey): string {
    const serialized = JSON.stringify(data);
    const size = new Blob([serialized]).size;

    if (key && shouldCompress(key, size)) {
      try {
        // Use LZ-based compression for better performance
        return this.lzCompress(serialized);
      } catch (error) {
        console.warn(`Compression failed for key ${key}, falling back to uncompressed:`, error);
        return serialized;
      }
    }

    return serialized;
  }

  /**
   * Decompresses data if it was compressed
   */
  static decompress<T>(data: string): T {
    try {
      // Try to decompress first
      return JSON.parse(this.lzDecompress(data));
    } catch {
      // If decompression fails, assume it's uncompressed
      return JSON.parse(data);
    }
  }

  /**
   * LZ-based compression
   */
  private static lzCompress(str: string): string {
    const dict: { [key: string]: number } = {};
    const data = (str + '').split('');
    const out: (string | number)[] = [];
    let currChar: string;
    let phrase = data[0];
    let code = 256;

    for (let i = 1; i < data.length; i++) {
      currChar = data[i];
      if (dict[phrase + currChar] != null) {
        phrase += currChar;
      } else {
        out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
        dict[phrase + currChar] = code;
        code++;
        phrase = currChar;
      }
    }
    out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));

    return out.map(char => String.fromCharCode(char as number)).join('');
  }

  /**
   * LZ-based decompression
   */
  private static lzDecompress(str: string): string {
    const dict: { [key: number]: string } = {};
    const data = (str + '').split('');
    const currChar = data[0];
    let oldPhrase = currChar;
    const out = [currChar];
    let code = 256;
    let phrase: string;

    for (let i = 1; i < data.length; i++) {
      const currCode = data[i].charCodeAt(0);
      if (currCode < 256) {
        phrase = data[i];
      } else {
        phrase = dict[currCode] ? dict[currCode] : oldPhrase + oldPhrase[0];
      }
      out.push(phrase);
      dict[code] = oldPhrase + phrase[0];
      code++;
      oldPhrase = phrase;
    }

    return out.join('');
  }

  /**
   * Estimates the size of data in bytes
   */
  static estimateSize(data: unknown): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  /**
   * Checks if data should be compressed based on size and type
   */
  static shouldCompress(data: unknown, key?: CacheKey): boolean {
    if (!COMPRESSION.ENABLED) return false;
    
    const size = this.estimateSize(data);
    if (key) {
      return shouldCompress(key, size);
    }
    
    return size > COMPRESSION.THRESHOLD_BYTES;
  }
} 