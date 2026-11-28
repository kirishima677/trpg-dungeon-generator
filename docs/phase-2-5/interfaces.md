# Generatorから再利用できる関数

この一覧は2026-11-28時点の実装済みAPI。生成アルゴリズムやGeneration Recipeを意味しない。以下の処理は編集Componentを起動せずに利用できる。

| 機能・実装 | 入力 → 出力 | 副作用・決定性 | エラー・制約 |
| --- | --- | --- | --- |
| `createDungeonDocument` / [dungeonFactory.ts](../../src/model/dungeonFactory.ts) | 任意のid・name・createdAt → 空の現行Document | 保存なし。既定はUUIDと現在時刻。明示値なら固定 | 完成後に全体検証を実行 |
| `resolvePieceSelection` / [themeSelection.ts](../../src/model/themeSelection.ts) | 方針・Piece一覧 → candidates/warnings | 純粋・安定ID順 | 不正方針は例外、参照欠落等はコード付き警告 |
| `resolveContentSelection` / 同上 | 6種別方針・Content一覧 → 種別別候補／警告 | 純粋・安定ID順 | 種別不一致、none、未解決を区別 |
| `evaluateRoomPiece` / [roomThemeResolver.ts](../../src/model/roomThemeResolver.ts) | Piece・構造条件・回転 → metrics/matches/reasons | 純粋 | 実際の占有セル・回転後幅高さ。配置自体はしない |
| `createPlacedRoom` / dungeonFactory.ts | Piece・座標・既存Room・回転・任意ID・部屋情報 → PlacedRoom | 入力非変更。既定IDはUUID、Pieceはコピー | ID・形状・番号・回転を検証。衝突判定は別途行う |
| `detectCollision` / [collisionDetection.ts](../../src/editor/collision/collisionDetection.ts) | 配置予定Room・既存Room・任意除外ID → boolean | 純粋 | 床セルの重複。配置候補の探索はしない |
| `getWorldCells` / `getWorldConnectors` / [geometry.ts](../../src/utils/geometry.ts) | Room → 回転・移動後の占有セル／端点 | 純粋 | グリッド単位。元の定義内Connector IDを保持 |
| `canConnect` / [connections.ts](../../src/model/connections.ts) | Room・Connection一覧・始終端 → boolean | 純粋 | 自室・不存在端点・端点重複を拒否。向きや距離は手動仕様どおり制約しない |
| `createConnection` / dungeonFactory.ts | Room・接続一覧・始終端・種別・任意ID → Connection | 保存なし。既定IDはUUID | ID重複・端点・種別を検証。経路探索は別 |
| `connectionGeometry` / [connectionGeometry.ts](../../src/editor/connectors/connectionGeometry.ts) | Connection・Room → ワールド端点／null | 純粋 | 欠落参照はnull |
| `createConnectionSceneResolver` / [connectionScene.ts](../../src/editor/connectors/corridor/connectionScene.ts) | Room・Connection → drawings・Network・開口情報 | 外部I/Oなし。内部キャッシュあり。固定物理入力なら固定結果 | 有界Routingの成功／失敗を保持。幾何情報は永続化しない |
| `resolveRoomTheme` / roomThemeResolver.ts | 任意のDungeon/Room Theme・Piece/Content → 統合候補・回転・必須素材・警告 | 純粋 | 未設定とnoneを区別。警告にはscope/code |
| `createThemeAssignment` / [dungeonTheme.ts](../../src/model/dungeonTheme.ts) | DungeonTheme → Assignment | 純粋・独立コピー | 不正定義は例外 |
| `createRoomThemeAssignment` / [roomTheme.ts](../../src/model/roomTheme.ts) | RoomTheme → Assignment | 純粋・独立コピー | 不正定義は例外 |
| `prepareRequiredPlacement` / [roomThemePlacement.ts](../../src/model/roomThemePlacement.ts) | Document・Room ID・Content/Piece → entries/added/blockers/conflicts | 外部書き込みなし。追加予定EntityにはUUID | 不足・種別不一致・容量はblocker。`requiredPlacementRevision`で確定前の状態変更を検出 |
| `resolveFaction` / [factionResolver.ts](../../src/model/factionResolver.ts) | Faction定義・素材・Theme → Monster/NPC・RoomTheme候補・警告 | 純粋 | 既存warningsは文字列。参照候補の全要素はIDを保持 |
| `createFactionInstance` / [factionState.ts](../../src/model/factionState.ts) | 定義・色の順番 → 独立したInstance | UUID以外の外部作用なし | 定義／公開範囲／色の既存検証 |
| `applyFactionCommand` / 同上 | Document・追加／関係／一括支配／削除等 → 勢力状態＋Entity＋Encounter | DB/Store非変更。追加・複製はUUID | 全体の勢力状態を検証後に返す。戻り値をDocumentへ一括反映 |
| `resolveEncounter` / [resolver.ts](../../src/model/encounter/resolver.ts) | Template・任意の部屋Context・Binding → 候補・diagnostics・互換文字列 | 純粋・固定ID順 | 対象Room／Role／Entryを持つ診断。経路情報は呼出側から渡す |
| `encounterRoleFeasibility` / 同上 | Template・Context・上限 → possible/impossible/incomplete・試行数 | 純粋。自動割り当てはしない | 最大2,000試行。incompleteをimpossibleと扱わない |
| `prepareEncounterPlan` / [application.ts](../../src/model/encounter/application.ts) | Template・Context・明示Binding/Entry選択・例外確認 → Plan | Store/DB非変更。検証のため一時Factory UUIDを発行 | 必須未解決・数量・構造は例外不可。警告の受入方針はApplication側 |
| `createEncounterInstance` / 同上 | 固定Plan → Encounter＋Entity配列 | UUID以外の外部作用なし | Plan構造を再検証。現Libraryへ問い合わせない |
| `applyEncounterPlan` / 同上 | Document・Plan・現在のContent・成功接続ID → Encounter/Entityの新配列 | 書き込みなし。確定UUID発行 | revisionとPlanを照合し、全件検証成功時のみ結果を返す |
| `createEntityInstance` / [entity.ts](../../src/model/entity.ts) | Room ID・Content・Room一覧・数量 → Entity | UUID以外の外部作用なし、Contentコピー | Room・数量・Snapshotサイズを検証。初期GM専用 |
| `applyEntityCommand` / 同上 | Entity/Room一覧・コマンド → 新配列／null | 外部書き込みなし。追加・複製はUUID | 既存の移動／複製時由来解除・数量／全体上限 |
| `duplicateRoomDocument` / [dungeonCommands.ts](../../src/model/dungeonCommands.ts) | Document・Room ID → document・新Room ID | 元入力不変。UUID発行 | 有界の既存複製配置。参照変換・全体上限。自動レイアウトエンジンではない |
| `deleteRoomDocument` / `deleteEncounterDocument` / 同上 | Document・ID・削除モード → 新Document | 純粋。時刻・保存・履歴なし | 部屋不存在はnull、Encounter不存在は例外。関連削除は既存規則 |
| `validateDungeonDocument` / [dungeonValidation.ts](../../src/model/dungeonValidation.ts) | 未検証データ・旧部屋情報の扱い → valid/document/diagnostics | 純粋・正規化済みコピー | 構造・内部参照・容量。Library欠落や制作条件をハードエラーにしない |
| `assertDungeonDocument` / 同上 | 同入力 → Document／例外 | 同上 | 検証ルールを再実装せずthrowで扱いたい境界向け |
| `buildExportEnvelope` / `parseDungeonJson` / [exportImport.ts](../../src/utils/exportImport.ts) | Document／JSON文字列 → envelope／Document | Exportにメタデータ時刻。保存・ダウンロードは行わない | 旧版・重複キー・内部参照・20 MiB上限 |
| `createPublicationSession` / [publicationSession.ts](../../src/publishing/publicationSession.ts) | 固定Document → map/guide/print/pieceSheet生成 | 入力コピー、Library/Store参照なし。内部キャッシュ | HTMLのサニタイズにはDOM環境が必要。NodeテストはJSDOM、実アプリはブラウザ |

Repositoryへ渡すまでは生成結果を保存しない。UIへ表示する場合は`useDungeonStore.getState().setDungeon(document)`が検証とUI状態・履歴の初期化を行う。このStore呼び出しはGenerator内部の責務に含めない。

## 最小の非UI使用例

```ts
import {createDungeonDocument,createPlacedRoom,createConnection} from './model/dungeonFactory';
import {assertDungeonDocument} from './model/dungeonValidation';

let document=createDungeonDocument({name:'廃棄された古城'});
const a=createPlacedRoom(piece,{x:0,y:0},document.rooms);
const b=createPlacedRoom(piece,{x:12,y:0},[a]);
document={...document,rooms:[a,b]};
const link=createConnection(document.rooms,[],
  {roomId:a.id,connectorId:eastConnectorId},
  {roomId:b.id,connectorId:westConnectorId});
document=assertDungeonDocument({...document,connections:[link]});
// 明示的に保存する段階で await dungeonRepository.save(document)
```

実際にTheme・必須配置・Faction・Encounter・JSON・出版まで通す例は[統合Fixture](../../tests/fixtures/integratedScenario.ts)と[非UI統合テスト](../../tests/integratedScenario.test.ts)を参照。これは固定入力のテストであり、自動選択・乱数シード・生成Recipe・再試行アルゴリズムは未実装。

## 次期開発で決めること

1. 再現性の契約（入力Library Snapshot、シード、許容警告、失敗／部分生成／取消の結果形式）。現在の適用SnapshotとGenerator Input Snapshotを区別する。
2. PRNG・重み付き抽選と、ID／時刻の注入範囲。今回のFactoryの既定UUID・作成日時は維持し、生成用IDアルゴリズムを導入していない。
3. 厳密候補と制約の充足。Resolverの警告を手動UIの例外確認とは別に扱う。
4. 論理接続グラフ、衝突のない部屋配置、既存Routingによる物理成立確認。物理NetworkとReachabilityは別設計とする。
5. Faction配置・領域、EncounterのRole充足、明示Planの作成、全体検証、通常Documentとして保存・編集・出版。

全操作を汎用Planへ変換する必要はない。単純CRUDは既存APIを利用し、複数モデルをまとめて変更する段階だけプレビュー・検証・確定を分ける。
