# TRPGダンジョンエディタ

TRPGのダンジョン自動生成＋編集ツール（MVP実装）

## 概要

React + TypeScript + Vite で構築した、ブラウザ上で動作するダンジョン編集ツールです。

## 機能

### キャンバス
- SVGによる方眼紙表示
- マウスホイールによる拡大・縮小
- 中ボタンドラッグまたはSpaceキー＋ドラッグでパン操作

### ピース
| 種別 | 説明 |
|------|------|
| 正方形の部屋 (4×4) | 標準的な正方形部屋 |
| 長方形の部屋 (3×6) | 横長の部屋 |
| L字の部屋 | L字形状の部屋 |
| 通路 (4マス) | 長い廊下 |
| 短い通路 (2マス) | 短い廊下 |

各ピースは以下の操作が可能：
- **配置**: サイドバーから選択 → キャンバスにクリック
- **移動**: ドラッグ
- **回転**: R キー または プロパティパネルの回転ボタン
- **削除**: Delete モードまたはプロパティパネルの削除ボタン

### コネクター
各ピースはコネクター（接続口）を持ちます。コネクターには以下の属性があります：
- **方向**: north / south / east / west
- **幅**: グリッドセル単位
- **種類**: open / door / secret / locked

方向・幅・種類が一致するコネクター同士のみ接続できます。

### 衝突判定
ピース配置時および移動時に、他のピースとの重なりを自動検出します。
重なりがある場合は赤色で表示され、配置できません。

### 保存
Dexie + IndexedDB を使用してブラウザローカルに保存します。

### Export / Import
JSON形式でエクスポート・インポートが可能です。
フォーマット識別子 `trpg-dungeon-generator` とスキーマバージョンを含みます。

### Undo / Redo
- `Ctrl+Z` で元に戻す（最大50履歴）
- `Ctrl+Y` または `Ctrl+Shift+Z` でやり直す

## 技術スタック

| 技術 | 用途 |
|------|------|
| React 19 | UIフレームワーク |
| TypeScript 6 | 型安全性 |
| Vite 8 | ビルドツール・開発サーバー |
| SVG | キャンバス描画 |
| Zustand 5 | 状態管理 (Undo/Redo含む) |
| Dexie 4 | IndexedDB ORM |
| uuid | ID生成 |

## ディレクトリ構成

```
src/
  model/          - TypeScript型定義・ピースライブラリ
  store/          - Zustand状態管理（Undo/Redo）
  db/             - Dexie DBセットアップ
  repository/     - データアクセス層
  editor/
    connectors/   - コネクター互換性ロジック
    collision/    - 衝突判定
  utils/
    geometry.ts   - 回転・座標変換ユーティリティ
    exportImport.ts - JSON Export/Import
  components/
    canvas/       - SVGキャンバス（グリッド・ズーム・パン）
    pieces/       - ピース描画・配置ゴースト
    sidebar/      - ピースライブラリUI
    toolbar/      - ツールバー
    ui/           - メニューバー・プロパティパネル
    editor/       - エディタメインレイアウト
```

## 開発・実行

```bash
npm install
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド
npm run lint     # Oxlint
```

## データモデル

```typescript
// コネクター（接続口）
interface Connector {
  id: string;
  direction: 'north' | 'south' | 'east' | 'west';
  width: number;
  kind: 'open' | 'door' | 'secret' | 'locked';
  position: { x: number; y: number };
}

// ピーステンプレート
interface Piece {
  id: string;
  name: string;
  shape: 'rectangle' | 'l-shape' | 'corridor';
  cells: { x: number; y: number }[];
  connectors: Connector[];
  tags?: string[];
}

// キャンバス上の配置済みピース
interface PlacedRoom {
  id: string;
  pieceId: string;
  piece: Piece;
  position: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  connections: Record<string, { roomId: string; connectorId: string }>;
}

// ダンジョンドキュメント
interface DungeonDocument {
  id: string;
  name: string;
  version: string;
  rooms: PlacedRoom[];
  meta: DungeonMeta;
  createdAt: string;
  updatedAt: string;
}
```

## 将来の拡張予定

- [ ] 自動ダンジョン生成アルゴリズム
- [ ] EncounterTemplate（エンカウンター設定）
- [ ] モンスター・アイテム配置
- [ ] マルチフロア対応
- [ ] Tauri化（デスクトップアプリ）
- [ ] モンスターデータベース連携
