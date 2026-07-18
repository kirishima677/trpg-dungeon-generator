import React, { useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useDungeonStore } from '../../store';
import { dungeonRepository } from '../../repository/dungeonRepository';
import {
  buildExportEnvelope,
  downloadJson,
  parseImport,
} from '../../utils/exportImport';

export function MenuBar() {
  const { dungeon, setDungeon, newDungeon } = useDungeonStore(useShallow(s => ({
    dungeon: s.dungeon,
    setDungeon: s.setDungeon,
    newDungeon: s.newDungeon,
  })));

  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await dungeonRepository.saveMainEditorSnapshot({
        ...dungeon,
        updatedAt: new Date().toISOString(),
      });
      flash('保存しました ✓');
    } catch {
      flash('保存に失敗しました ✗');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const envelope = buildExportEnvelope(dungeon);
    downloadJson(envelope, `${dungeon.name}.dungeon.json`);
    flash('エクスポートしました ✓');
  };

  const handleImport = () => {
    fileRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const envelope = parseImport(raw);
      setDungeon(envelope.dungeon);
      flash('インポートしました ✓');
    } catch {
      flash('インポートに失敗しました ✗');
    } finally {
      // reset so same file can be re-imported
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: '#1e293b',
        color: 'white',
        fontSize: 14,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 16, marginRight: 8 }}>
        🗺 ダンジョンエディタ
      </span>

      {/* Dungeon name */}
      <input
        value={dungeon.name}
        onChange={e =>
          useDungeonStore.setState(s => ({
            dungeon: { ...s.dungeon, name: e.target.value },
          }))
        }
        style={{
          background: '#334155',
          border: '1px solid #475569',
          borderRadius: 4,
          color: 'white',
          padding: '2px 8px',
          fontSize: 14,
          width: 200,
        }}
      />

      <button onClick={() => newDungeon()} style={btnStyle}>新規</button>
      <button onClick={handleSave} disabled={saving} style={btnStyle}>
        {saving ? '保存中…' : '保存'}
      </button>
      <button onClick={handleExport} style={btnStyle}>エクスポート</button>
      <button onClick={handleImport} style={btnStyle}>インポート</button>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {message && (
        <span style={{ marginLeft: 12, color: '#86efac', fontWeight: 600 }}>
          {message}
        </span>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#334155',
  border: '1px solid #475569',
  borderRadius: 4,
  color: 'white',
  padding: '4px 12px',
  cursor: 'pointer',
  fontSize: 13,
};
