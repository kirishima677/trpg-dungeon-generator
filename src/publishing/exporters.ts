export const MAX_CANVAS_DIMENSION = 8192;
export const MAX_CANVAS_PIXELS = 16_777_216;
export const EXPORT_TIMEOUT_MS = 15_000;

export function exportFilename(name: string, audience: 'gm' | 'player', format: 'svg' | 'png' | 'html') {
  const safe = [...name.normalize('NFC')].map(c => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127 ? '_' : c).join('').replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '').trim();
  return `${([...safe].slice(0, 80).join('') || 'dungeon')}-${audience}${format === 'html' ? '-guide' : ''}.${format}`;
}
export function validatePngDimensions(width: number, height: number) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= MAX_CANVAS_DIMENSION)
    || width * height > MAX_CANVAS_PIXELS) {
    throw new Error(`PNGは一辺${MAX_CANVAS_DIMENSION}px・合計${MAX_CANVAS_PIXELS.toLocaleString()}画素までです。解像度や余白を下げてください。`);
  }
}
export interface PngEnvironment {
  fontsReady: Promise<unknown>;
  createImage: () => HTMLImageElement;
  createCanvas: () => HTMLCanvasElement;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
}
function timed<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), EXPORT_TIMEOUT_MS);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}
/** Rasterize the exact preview SVG, rather than maintaining a second map renderer. */
export async function svgToPng(svg: string, width: number, height: number,
  background: 'white' | 'transparent' = 'transparent', environment?: PngEnvironment): Promise<Blob> {
  validatePngDimensions(width, height); // Before any image or canvas allocation.
  if (!['white', 'transparent'].includes(background)) throw new Error('背景設定が不正です。');
  const env = environment ?? { fontsReady: document.fonts.ready, createImage: () => new Image(),
    createCanvas: () => document.createElement('canvas'), createUrl: URL.createObjectURL, revokeUrl: URL.revokeObjectURL };
  await timed(env.fontsReady, '日本語フォントの準備が完了しませんでした。');
  let url: string | undefined, canvas: HTMLCanvasElement | undefined, image: HTMLImageElement | undefined;
  try {
    url = env.createUrl(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    image = env.createImage();
    const loaded = new Promise<void>((resolve, reject) => {
      image!.onload = () => resolve();
      image!.onerror = () => reject(new Error('SVG画像を読み込めませんでした。'));
      image!.src = url!;
    });
    await timed(loaded, 'SVG画像の読み込みが完了しませんでした。');
    canvas = env.createCanvas(); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('この環境ではPNG画像を生成できません。SVG出力を利用してください。');
    // Fractional viewBox scaling may antialias the SVG's outermost background
    // pixels. Composite onto an opaque canvas only when white was requested.
    if (background === 'white') { context.fillStyle = 'white'; context.fillRect(0, 0, width, height); }
    context.drawImage(image, 0, 0, width, height);
    const activeCanvas = canvas;
    return await timed(new Promise<Blob>((resolve, reject) => activeCanvas.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error('PNG画像の変換に失敗しました。')), 'image/png')), 'PNG画像の変換が完了しませんでした。');
  } finally {
    if (image) { image.onload = image.onerror = null; image.src = ''; }
    if (url) env.revokeUrl(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  try {
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
