import { AsyncZipDeflate, Zip, ZipPassThrough } from 'fflate';
import type { PackageArtifact } from './packagePlan';
import { MAX_PACKAGE_FILES, MAX_PACKAGE_FILE_BYTES, MAX_PACKAGE_TOTAL_BYTES, MAX_PACKAGE_ZIP_BYTES, safePackagePath } from './packagePlan';

export const abortError = () => new DOMException('出版パッケージの生成をキャンセルしました。', 'AbortError');
export function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
export async function packageBoundary(signal?: AbortSignal) { checkAbort(signal); await new Promise(resolve => setTimeout(resolve, 0)); checkAbort(signal); }

/** Pure archiving boundary. One asynchronous compressor at a time, no rendering or downloads. */
export async function buildZip(files: readonly Pick<PackageArtifact, 'path' | 'data' | 'mediaType'>[], signal?: AbortSignal): Promise<Blob> {
  checkAbort(signal);
  if (!files.length || files.length > MAX_PACKAGE_FILES) throw new Error('ZIPの収録ファイル数が不正です。');
  const seen = new Set<string>(); let total = 0;
  for (const f of files) {
    const key = safePackagePath(f.path);
    if (seen.has(key)) throw new Error('ZIP内のパスが重複しています。'); seen.add(key);
    if (!(f.data instanceof Uint8Array) || !f.data.length || f.data.length > MAX_PACKAGE_FILE_BYTES) throw new Error('ZIPの個別ファイルサイズが不正です。');
    total += f.data.length;
    if (total > MAX_PACKAGE_TOTAL_BYTES) throw new Error('圧縮前の総データが96MiBを超えています。');
  }
  return new Promise<Blob>((resolve, reject) => {
    let settled = false, size = 0, rejectFile: ((error: unknown) => void) | undefined;
    const chunks: ArrayBuffer[] = [];
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    const fail = (error: unknown) => {
      if (settled) return; settled = true; cleanup(); zip.terminate(); chunks.length = 0;
      rejectFile?.(error); reject(error);
    };
    const cancel = () => fail(abortError());
    const zip = new Zip((error, bytes, final) => {
      if (error) { fail(error); return; }
      if (settled) return;
      size += bytes.byteLength;
      if (size > MAX_PACKAGE_ZIP_BYTES) { fail(new Error('ZIPサイズが100MiBを超えています。')); return; }
      try {
        chunks.push(new Uint8Array(bytes).buffer);
        if (final) { const blob = new Blob(chunks, { type: 'application/zip' }); settled = true; cleanup(); resolve(blob); chunks.length = 0; }
      } catch (e) { fail(e); }
    });
    signal?.addEventListener('abort', cancel, { once: true });
    void (async () => {
      try {
        for (const f of files) {
          await packageBoundary(signal);
          await new Promise<void>((done, bad) => {
            rejectFile = bad;
            const stream = f.mediaType === 'image/png' ? new ZipPassThrough(f.path) : new AsyncZipDeflate(f.path, { level: 6 });
            stream.mtime = new Date('2020-01-01T00:00:00Z');
            zip.add(stream);
            const emit = stream.ondata;
            stream.ondata = (error, data, final) => {
              try { emit(error, data, final); }
              catch (e) { fail(e); bad(e); return; }
              if (error) bad(error);
              else if (final) { if ('terminate' in stream) stream.terminate(); rejectFile = undefined; done(); }
            };
            stream.push(f.data.slice(), true);
          });
        }
        checkAbort(signal); zip.end();
      } catch (e) { fail(e); }
    })();
  });
}
