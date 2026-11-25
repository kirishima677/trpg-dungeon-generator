# TRPGダンジョンエディタ

TRPGのダンジョン自動生成＋編集ツール（MVP実装）

![Editor](docs/images/editor.png)

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

### 手動接続（コネクターシステム MVP）

- ツールバーの 🔗 ボタン、または `C` キーで接続モードへ切り替える
- 異なる部屋の白い接続ポイントを2つクリックして接続を作成する
- ポイントは白が未接続、青が選択中、灰色が接続済み。1ポイントにつき1接続
- 同じポイントの再クリック、`Esc`、キャンセルボタンで始点の選択を解除する
- 新しい接続の種類は通路 / ドア / 階段 / 隠し通路から選択する
- 線を選択して右パネルの「接続を削除」、`Delete` / `Backspace`、または削除モードで線をクリックすると削除する
- 接続の作成・削除、部屋削除に伴う接続削除は Undo / Redo に対応する
- `V` キーで選択モードへ戻り、部屋を移動・回転すると線が追従する

接続は `DungeonDocument.connections` に部屋ID・固定コネクターID・種類を保存します。
接続経路は部屋の現在位置・回転後のコネクター方向から毎回計算し、SVG・経路座標・自動生成通路ピースは保存しません。
手動接続では距離・方向・幅・コネクター種類による制約を設けません。
既存の隣接コネクター候補判定は別用途のロジックとして残しています。

### 直交ルーティング

接続線は水平・垂直線を組み合わせたL字・Z字・折り返し経路で描画します。
始点はコネクターの外向き方向へ伸び、終点は外側から接続口へ入ります。
対向・直角・同方向の全16通りに対応し、部屋の移動・回転やUndo / Redo後も自動で再計算します。
対向する接続口が一直線上にあり、間に障害物がない場合は水平または垂直の1本線になります。

Routing層とRendererは分離しています。経路は保存データに追加せず、既存の接続情報から再生成します。
交差回避・Waypoint・手動経路編集・通路アセット生成は今後の拡張です。
詳細は [直交ルーティング実装メモ](docs/orthogonal-routing.md) を参照してください。

![Orthogonal Routing](docs/images/orthogonal-routing.png)

### 障害物回避ルーティング

- 配置済みの全ピースを、実際の占有セルから障害物として扱う（L字の空き部分は通行可能）
- 既存の直交経路が安全なら再利用し、衝突する場合だけ上下左右4方向のA*で迂回する
- 接続元・接続先の部屋も障害物に含め、接続口の外側の空きセル同士をつなぐ
- 接続対象以外の部屋の追加・移動・回転・削除でも経路を更新する
- 接続口が塞がれている場合や探索上限に達した場合は、接続を保持して赤い警告経路を表示する
- 赤い経路は通行可能な経路ではなく接続関係の表示。線の説明で失敗理由を確認でき、配置を変えると自動復旧する

占有グリッド・経路・探索状態は保存しません。保存形式 `1.1.0` と既存データの互換性を維持します。
探索範囲とノード数には上限があります。具体値と検証内容は [障害物回避実装メモ](docs/obstacle-routing.md) を参照してください。

![Obstacle Routing](docs/images/obstacle-routing.jpg)

### 動的通路の床・壁描画

- `corridor` 接続を、1グリッドセル幅の床・壁を持つ通路として描画する
- 方向ビットマスクから水平・垂直・曲がり角・接続端部の壁を生成し、接続方向には壁を描かない
- 部屋と同じ40px間隔・色・太さのマス目を描画し、選択中や共有区間でも維持する
- 部屋側の接続口も開口し、1セル通路・隣接部屋の直接接続に対応する
- 床セルから生成元Connectionを選択し、経路全体を強調表示できる
- `door` / `stairs` は従来の線表示、`secret` は紫の破線表示を維持する
- 経路探索失敗時は通路を描かず赤い警告線を表示し、配置変更で復旧する

通路はConnection単位で生成した後、通常通路同士の同一セルを集約します。
生成セル・ビットマスク・床や壁の形状をPieceや保存データへ追加せず、読み込み後に再生成します。
手動配置の通路Pieceは従来どおり保存・編集できます。
展開は1接続4,096セル・全体16,384セルを上限とし、超過時は線表示へ戻します。
詳細は [動的通路描画実装メモ](docs/dynamic-corridors.md) を参照してください。

![Dynamic Corridors](docs/images/dynamic-corridor.jpg)

### 通路の交差・合流・分岐

- 通常通路が同じセルを通ると方向ビットを統合し、T字路・十字路・共有区間を生成する
- 床と壁は統合後に一度だけ描画し、合流点の接続方向を開口する
- 隣接するだけの通路は接続せず、ドア・階段・隠し通路は独立した線表示を維持する
- 共有セルの再クリックで生成元Connectionを1本ずつ切り替え、選択した経路全体を強調する
- 右パネルの接続一覧からも選択でき、端点・種類を確認して個別に削除できる
- 削除モードでも共有セルのクリックは選択切替のみ。削除は右パネルまたはDeleteキーで実行する
- 削除・移動・回転・Undo / Redo・読み込み後は、残る論理データからネットワークを再生成する

物理的な合流によって移動できる部屋の組み合わせが増えても、論理Connectionを自動追加・変更しません。
ネットワーク・合流点・生成元ID一覧は保存しません。失敗した経路は集約から除外し、既存の警告を表示します。
詳細は [通路ネットワーク実装メモ](docs/corridor-network.md) を参照してください。

![Shared Corridor Network](docs/images/corridor-network-shared.jpg)

### 衝突判定
ピース配置時および移動時に、他のピースとの重なりを自動検出します。
重なりがある場合は赤色で表示され、配置できません。

### 保存
Dexie + IndexedDB を使用してブラウザローカルに保存します。
メニューバーの「保存」で保存し、「読込」で保存済みダンジョンを開きます。
ページ再読み込み後も「読込」から部屋・接続を復元できます。
読み込み時には現在の未保存の編集を置き換えます。

### Export / Import
JSON形式でエクスポート・インポートが可能です。
フォーマット識別子 `trpg-dungeon-generator` とスキーマバージョンを含みます。
現在のスキーマは `1.1.0` で、接続情報も含みます。従来の `1.0.0` を読み込み可能です。
接続情報のない旧データは空の接続一覧として読み込みます。
旧 `PlacedRoom.connections` に接続がある場合はドキュメント単位の接続へ移行し、
部屋単位のマップは除去します。詳細は [コネクター実装メモ](docs/connector-system.md) を参照してください。

### Markdown Editor
- ツールバーの `Markdown` ボタンから別ウィンドウで開く
- EasyMDE ベースの編集（Edit / Preview / Split）
- DungeonDocument に紐づく Markdown を Repository 経由で保存
- 1秒デバウンスの自動保存 + 手動保存
- `.md` のインポート / エクスポート
- Preview を使った PDF 出力（ブラウザ印刷）

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
    connectors/   - コネクター座標計算・互換性ロジック
      routing/    - 占有グリッド・直交経路・A*・Router境界
      corridor/   - 通路セル・方向ビット・壁形状・描画用データ
    collision/    - 衝突判定
  utils/
    geometry.ts   - 回転・座標変換ユーティリティ
    exportImport.ts - JSON Export/Import
  components/
    canvas/       - SVGキャンバス（グリッド・ズーム・パン）
    pieces/       - ピース描画・配置ゴースト
    connections/  - 通路床壁・接続線・警告描画・接続ポイントUI
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
npm test         # 接続・経路・通路セル／描画・履歴・互換性・保存の回帰テスト
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
}

// 配置済み部屋同士の論理的な接続（座標は保存しない）
interface Connection {
  id: string;
  fromRoomId: string;
  fromConnectorId: string;
  toRoomId: string;
  toConnectorId: string;
  type: 'corridor' | 'door' | 'stairs' | 'secret';
}

// ダンジョンドキュメント
interface DungeonDocument {
  id: string;
  name: string;
  version: string;
  rooms: PlacedRoom[];
  connections: Connection[];
  markdown: string;
  meta: DungeonMeta;
  createdAt: string;
  updatedAt: string;
}
```

## 技術スタック採用理由

### React

コンポーネント指向でエディタUIを構築しやすく、

将来的な機能追加・分割が容易なため採用。

### TypeScript

型安全性を確保し、

ダンジョンデータやコネクターなど複雑なデータ構造を安全に扱うため採用。

### Vite

高速な開発サーバーとビルド速度を重視して採用。

### SVG

部屋や通路、コネクターをベクター形式で描画するため採用。

CanvasよりDOMとして扱いやすく、クリック判定や編集機能との相性が良い。

### Zustand

シンプルな状態管理ライブラリ。

Undo/Redoや選択状態など、エディタ向けの状態管理を容易に実装できる。

### Dexie

IndexedDBを扱いやすくするORM。

ブラウザだけで保存・読込ができ、将来的なオフライン編集にも対応できる。

### UUID

配置済み部屋やドキュメントを一意に識別するため採用。

## ロードマップ

### Phase1（MVP）

- [x] SVGキャンバス

- [x] ピース配置

- [x] Undo / Redo

- [x] Export / Import

### Phase2

- [x] 手動コネクター接続 MVP（直線・追従・保存・Undo / Redo）

- [x] 直交ルーティング基盤（コネクター方向に応じたL字・Z字・折り返し経路）

- [x] 障害物回避ルーティング（実セル占有・A*・探索上限・失敗表示）

- [x] 動的通路描画（1セル幅の床・壁・接続口開口・接続単位の操作）

- [ ] コネクター自動接続

- [ ] 自動ダンジョン生成

- [ ] ピース編集

### Phase3

- [ ] EncounterTemplate

- [ ] Monster配置

- [ ] Event配置

### Phase4

- [ ] Tauri版

- [ ] プラグイン対応
