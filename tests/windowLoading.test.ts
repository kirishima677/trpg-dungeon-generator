import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { act, createElement, lazy } = await import('react');
const { createRoot } = await import('react-dom/client');
const { WindowLoader } = await import('../src/components/WindowLoader');
after(() => dom.window.close());

test('a pending window shows its name and then renders the loaded screen', async () => {
  let complete!: (value: { default: () => React.ReactNode }) => void;
  const Screen = lazy(() => new Promise<{ default: () => React.ReactNode }>(resolve => { complete = resolve; }));
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(WindowLoader, { name: 'ピースエディタ', children: createElement(Screen) })));
    assert.match(document.querySelector('[role="status"]')!.textContent!, /ピースエディタを準備しています/);
    await act(async () => complete({ default: () => createElement('h1', null, 'ピース一覧') }));
    assert.equal(document.querySelector('[role="status"]'), null);
    assert.equal(document.querySelector('h1')?.textContent, 'ピース一覧');
  } finally { await act(async () => root.unmount()); }
});

test('a failed window import offers a working reload action instead of a blank screen', async t => {
  let fail!: (error: Error) => void;
  const Screen = lazy(() => new Promise<{ default: () => null }>((_, reject) => { fail = reject; }));
  const root = createRoot(document.getElementById('root')!);
  t.mock.method(console, 'error', () => {}); // React reports this intentionally rejected import.
  try {
    await act(async () => root.render(createElement(WindowLoader, { name: '出版画面', children: createElement(Screen) })));
    await act(async () => fail(new Error('Failed to fetch dynamically imported module')));
    assert.equal(document.querySelector('[role="status"]'), null);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /出版画面を表示できませんでした/);
    const button = document.querySelector('button')!;
    assert.equal(button.textContent, '再読み込み');
    let reloaded = 0;
    Object.assign(globalThis, { window: { location: { reload: () => { reloaded++; } } } });
    try { await act(async () => button.click()); }
    finally { Object.assign(globalThis, { window: dom.window }); }
    assert.equal(reloaded, 1);
  } finally { await act(async () => root.unmount()); }
});

test('production entry and each window exclude unrelated screens and the Markdown editor library', async () => {
  const { build } = await import('vite');
  const result = await build({ logLevel: 'silent', build: { write: false } });
  assert.ok(!Array.isArray(result) && 'output' in result);
  const chunks = result.output.filter(item => item.type === 'chunk');
  const entry = chunks.find(chunk => chunk.isEntry)!;
  assert.ok(entry);
  const roots = ['editor/Editor.tsx', 'markdown/MarkdownEditorWindow.tsx',
    'pieceEditor/PieceEditorWindow.tsx', 'publishing/PublishingWindow.tsx'];
  function modulesFrom(file: string, visited = new Set<string>()): string[] {
    if (visited.has(file)) return [];
    visited.add(file);
    const chunk = chunks.find(chunk => chunk.fileName === file);
    assert.ok(chunk, `missing chunk: ${file}`);
    return [...Object.keys(chunk.modules), ...chunk.imports.flatMap(file => modulesFrom(file, visited))];
  }
  const entryModules = modulesFrom(entry.fileName);
  for (const path of roots) assert.ok(!entryModules.some(id => id.endsWith(`/components/${path}`)), `entry eagerly loads ${path}`);
  for (const path of roots) {
    const chunk = chunks.find(chunk => Object.keys(chunk.modules).some(id => id.endsWith(`/components/${path}`)));
    assert.ok(chunk, `missing window: ${path}`);
    const modules = [...entryModules, ...modulesFrom(chunk.fileName)];
    for (const other of roots.filter(other => other !== path)) {
      assert.ok(!modules.some(id => id.endsWith(`/components/${other}`)), `${path} eagerly loads ${other}`);
    }
    assert.equal(modules.some(id => id.includes('/node_modules/easymde/')), path === 'markdown/MarkdownEditorWindow.tsx');
  }
  assert.ok(chunks.every(chunk => Buffer.byteLength(chunk.code) <= 500_000), 'a chunk exceeds the existing 500 kB warning threshold');
});
