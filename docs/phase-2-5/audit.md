# Phase 2.5 統合技術監査

監査日: 2026-11-28。リファクタリング前の記録。作業開始時は`codex/encounter-templates` / `6476970`、未コミット変更なし。最新master `be8ffc7`は前回PR #26のマージでソース差分なし。作業ブランチは`codex/phase-2-5-audit`。

## ベースライン

`package.json`の`npm test`、`npm run build`（`tsc -b && vite build`）、`npm run lint`を実行。**757成功／0失敗／0スキップ、3,550.10 ms**。ビルド・型検査・lint成功。仕様書の報告値755件との差は、前回追加した元定義削除後の保持・複製上限テスト2件による。削除・統合した既存テストはない。

環境はNode v26.13.1 / Darwin arm64。DB v6、Dungeon JSON 1.7.0、各Library JSON 1.0.0。実際の依存バージョン、ソース構成、テストファイル一覧は[baseline.json](baseline.json)に記録。設計資料はREADMEと既存`docs/*.md`を確認した。Office形式は生成しない。

## 修正対象

以下はコード追跡と変更前の非UIプローブで確認した問題。P0は再現した不正状態の保存・情報喪失経路であり、ユーザーの保存データに被害が発生したと断定するものではない。

| ID・優先度 | 対象・現在の実装 | 再現・影響 | 推奨修正・リスク・必要検証 |
| --- | --- | --- | --- |
| A01 P0 | `normalizeDungeon.ts` / `exportImport.ts` / `dungeonRepository.ts`: 保存・Exportが正規化を検証の代わりに使用 | 同じRoom IDを2件含め、Connectionの接続先を不存在IDにしてExportすると、重複Roomを受理してConnectionを0件へ黙って除去。Importは厳しく、保存と出力の境界が不一致 | 共通の非UI全体検証を追加し、保存・Exportで部分破棄前に拒否。旧版の明示された補完・移行は維持。リスク中。内部参照・重複・旧JSON・保存失敗時の原子性を検証 |
| A02 P0 | `normalizeDungeon.ts` / `dungeonStore.ts:addRoom`: RoomのPiece・position・metaを浅いコピーで保持 | 正規化後に入力元の`piece.cells[0].x`を変えると結果も変化。Storeへの部屋追加も同様。履歴を経由しない構造変更の経路 | 境界でSnapshotを独立コピー。物理的に同じ内容のSceneキャッシュは維持。リスク低〜中。入力・Factory・Store・履歴間の参照独立と再計算を検証 |
| A03 P1 | `dungeonStore.ts`: 空Dungeon生成・部屋複製・関連削除がStore内に閉じている | Reactなしの生成処理でも、初期化・複合操作の再利用にZustandを読む必要がある。Entity/Faction/Encounter Factoryは既に独立 | ドキュメント初期化・Room/Connection Factoryと部屋複製／削除・Encounter削除をドメインへ分離。UI状態とUndoはStoreが保持。リスク中。非UIスモーク・同一操作のStore回帰・失敗時無変更を検証 |
| A04 P1 | `encounter/resolver.ts` / `application.ts` / `RoomEncounterPanel.tsx`: 診断が文字列のみ | UIの「判定未完了」とPlanの警告除外が日本語文言の部分一致に依存。Generatorが不足／条件外／探索未完了を機械判別できない | コード・重要度・対象を持つ診断を併記し、既存文字列出力を互換維持。選択不足の条件評価と手動例外方針を分離。リスク中。既存UI・必須／任意・固定参照・構造エラー・探索境界を検証 |
| A05 P2 | `encounter/resolver.ts` / `factionResolver.ts`: 候補の積集合を配列内検索で反復 | Entry×Theme×Factionで同じID比較を反復。共通Selection自体は既に統合されている | 安定順を維持するID積集合の小さな純粋ヘルパーを検討。計測・回帰で有効な範囲だけ変更。リスク低。none／未設定・順序・不変性を検証 |
| A06 P2 | `repository/*Repository.ts`: Content／Theme／RoomTheme／Faction／EncounterのCAS・Import処理がほぼ同一 | 同じ競合・単調日時・Import原子性の修正を5箇所へ適用する必要がある | 実際に同一の保存手順だけを共通化し、各型・正規化・参照変換・通知は各Repositoryに残す。Piece/Dungeonは固有規則を維持。リスク中。既存CAS・ロールバック・通知・全Editor回帰を必須とする |
| A07 P2 | `tests/fixtures`と統合テスト: 断片ごとのFixture中心 | 全ライブラリ・非矩形／回転・秘密接続・必須由来・Faction・Encounterを同時に組み立てて検証する固定ケースがない | 固定入力の非UI統合シナリオを追加。新しい乱数・生成方式は導入しない。リスク低。JSON・保存・全Player成果物とPNG入力・Undo・参照不変条件を検証 |

件数: **P0 2／P1 2／P2 3／P3 0**。修正結果と残存事項は[results.md](results.md)へ追記する。

## 確認済みの設計・変更不要の領域

- Definition／InstanceのIDは分離済み。Roleは定義IDの選択方針とInstance Bindingを区別。部屋番号は表示・ソート用で内部参照に使わない。ContentKindは`content.ts`が唯一の定義。VisibilityはEntity型が基準、Factionは公開名称も持つ固有モデル。
- Selectionの4モード・タグ・除外・安定ID順・不足コードは`themeSelection.ts`へ統合済み。filteredの空条件をallへ変換せず、noneは空。異なるモデルを同じDefinition型へ統合する必要はない。
- ResolverはReact／Zustand／Repository／時刻／乱数に依存しない。FactoryはUUID発行以外の外部書き込みなし。必須配置プレビューで一時UUIDを発行する点は、確定IDの再現性とは別に記録する。
- Entity/Faction/Encounter・ThemeのSnapshotは各正規化で独立化。Publish Sessionは開始時に`structuredClone`。元定義の弱い参照は欠落を許容し、内部Room／Faction／Encounter参照は強い参照。Room Theme必須由来は履歴情報で、テーマ変更・解除後も保持する。
- Faction削除・Encounter適用・Library Importは一括検証後に確定。各LibraryはCASとトランザクションを使用し、成功後に通知。Markdown部分保存は専用フィールドのみ更新。Dungeon本体の同時編集は最後の保存が優先される既存仕様で、Library CASとは区別する。
- 物理Sceneキャッシュは位置・回転・セル・Connector・Connectionをキーにし、シナリオ情報を含めない。論理Connection・接続可能端点・描画上の通路合流は別概念。Reachability Graphは未実装で、Encounterの隣接数は正常な論理Connectionの相手部屋だけ。
- Publisherは現在Libraryを取得せず固定入力から抽出する。Player投影は許可項目のみで、RendererもGMフィールドを参照しない。MarkdownはDOMPurifyを使用。ZIPは固定安全パス・容量上限・公開設定を検証。PNGはPlayer SVGから生成。
- 各Editorは既存の共通Workbench／Library Hookを使用。Piece Editorは参照保護という別責務。巨大な共通フォームへの統合・大規模UI変更・差分履歴エンジンは採用しない。
- IDはUUID、Connectorは定義内固定ID。DateはメタデータとCAS、UUIDは作成・複製・通信要求で使用。Resolver内の暗黙的な乱数はない。seed付き乱数・生成Recipe・生成用IDアルゴリズムは対象外。

## 計測と作業順序

変更前のEncounter revisionは331,355文字・Entity 500件の入力で7回計測し、約0.76〜2.58 ms。現時点で全体ハッシュ方式を置き換える根拠はない。共通候補・Routing・保存／出版・Undoは同一固定データセットで別途前後比較する。

1. 再現テストと統合検証、Snapshot保全（A01・A02）。
2. Storeから初期化・物理Factory・複合操作を分離（A03）。
3. Encounterの機械判別可能な診断、候補共通処理（A04・A05）。
4. 同一Repository手順だけを整理（A06）。
5. 非UI統合・公開分離・性能・ブラウザ検証、インターフェース一覧と結果文書（A07）。

スキーマを変更せず、既存テストを維持して各単位で確認する。境界検証による不正データの拒否を除き、正常な既存制作の規則を強化しない。未実行の検証は成功と報告しない。
