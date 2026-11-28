# Phase 2.5 実装完了報告

## 結果

統合監査に基づくデータ保全・責務分離・診断整理・保存処理の共通化を実施しました。既存の編集・保存・出版仕様とJSON／DBの版を維持し、UIなしで通常のDungeonDocumentを構築・検証・保存・出版する経路を統合テストで確認しました。自動生成アルゴリズムは追加していません。

作業前の監査と計画は[audit.md](audit.md)、現在の構成は[architecture.md](architecture.md)、次期開発向けのAPI一覧・入力／出力・副作用・決定性・制約・例は[interfaces.md](interfaces.md)を参照してください。

## 監査結果と対応

| 問題 | 優先度 | 対応 |
| --- | --- | --- |
| A01 保存・Exportの検証境界不一致 | P0 | 共通全体検証を追加。重複Room・不正な明示Connectionを保存／出力／Store置換前に拒否。検証失敗時のDB・Store・履歴無変更を確認 |
| A02 物理Snapshotの参照共有 | P0 | 部屋のPiece・位置・metaを独立コピー。新規配置もFactoryで入力から独立。元定義・入力座標の変更がStoreへ波及しない |
| A03 Storeに閉じた生成・複合操作 | P1 | 空Document／Room／Connection Factoryと、部屋複製・部屋削除・Encounter削除を非UIモジュールへ分離。選択・確定日時・UndoはStoreに維持 |
| A04 Encounter診断の文字列依存 | P1 | code/severity/category/contextを追加し、既存文字列を互換維持。UI・Planから日本語の部分一致による分岐を除去。候補が消えた層の診断を追加し、適用後の重複表示を除去 |
| A05 候補の積集合処理の反復 | P2 | 小さなID積集合関数を3つのResolverで共用。noneと未設定、安定順・入力不変を維持。速度向上の効果は断定しない |
| A06 5種類のRepositoryの同一手順 | P2 | CAS・単調日時・トランザクション・Import集計を共有。具体型・バッチ検証・比較・通知は各Repositoryに残し、DungeonとPieceは固有処理を維持 |
| A07 複数領域を横断する固定Fixture不足 | P2 | 8部屋・回転L字・秘密接続・必須配置・勢力関係／係争・公開／非公開Encounter／Entityを含むFixtureと非UI統合テストを追加 |

**今回修正対象の7件: P0 2／P1 2／P2 3／P3 0。全件対応済み。** これは全入力や同時編集方式に将来のリスクがないという主張ではありません。既存仕様として維持した制約と次期課題を末尾に記録します。

削除したのはStoreから移した実装、重複したImport側の物理検証、5つのRepositoryに複製されていた同一の保存手順です。機能・テスト・ユーザーデータを削除していません。ドメインモデルの全面統合やStoreの分割、独自クエリ言語、生成専用永続化モデル、新しいサニタイザー、依存追加は行っていません。

## 品質検証

| 検証 | 作業前 | 作業後 |
| --- | --- | --- |
| 自動テスト | 757件 | **775件** |
| 成功／失敗／スキップ | 757／0／0 | **775／0／0** |
| 実行時間（1回の実測） | 3,550.10 ms | 3,454.60 ms |
| TypeScript | `npm run build`内の`tsc -b`成功 | 成功 |
| Production Build | 成功 | 成功 |
| Lint | 成功・警告なし | 成功・警告なし |
| `git diff --check` | 作業開始時clean | 成功 |

実行時間はプロセス同時実行やキャッシュ等で変わるため、高速化の根拠にはしません。既存757件を削除・統合せず、意味のある境界・参照・非UI経路のテスト18件を追加しました。

| 追加テスト | 件数 | 主な検証 |
| --- | ---: | --- |
| `dungeonValidation.test.ts` | 3 | 重複Room・接続・保存／Store失敗時の無変更・入力参照独立・旧版／弱い参照／強い参照 |
| `dungeonCommands.test.ts` | 3 | 非UI Factory・端点／番号、複合操作、由来・Snapshot・Undo／Redo、無変更履歴、Scene維持 |
| `encounterDiagnostics.test.ts` | 5 | 構造／参照／任意不足／未評価・探索上限、Dungeon／Room／Factionの除外段階、手動例外、積集合の順序・不変性 |
| `architecture.test.ts` | 2 | Domain／Publisherの禁止依存、静的実行時importの循環なし |
| `integratedScenario.test.ts` | 5 | 全モデルを非UI構築・保存・再読込・空Library復元・JSON往復、複合参照不変条件、Player／Complete全成果物とPNG入力 |

既存の正常／異常系、JSON版・重複キー・サイズ・危険属性・Snapshot、DB v1〜v6移行・既存全テーブル保持、Library競合・Import途中失敗のロールバック・通知／未保存保護、Entity／Faction／Encounter由来、接続・A*・通路Network・Theme必須配置、ガイド・印刷・ZIPの公開分離とハッシュ基準も全て実行しています。古いテストの期待値を今回の出力に合わせて緩和してはいません。

## 非UIスモーク

`tests/fixtures/integratedScenario.ts`は固定ライブラリ入力から次の制作工程を実行します。

1. Document・8部屋・通常／秘密ConnectionをFactoryで作成。
2. Dungeon／Room ThemeをSnapshotで適用し、必須Contentを一括生成。
3. 3つのFaction Instance、敵対関係、単独支配・係争を設定。
4. Encounter Resolver、手動Bindingと数量、Application Plan、Factoryを利用してEncounterとEntityを生成。Role不要の別Encounterも追加。
5. 公開範囲・現在の状況・Entity個別名称／数量を手動変更。
6. 全体検証・JSON往復・空LibraryのDBへ保存して閉じ直し、同一制作データを復元。
7. GM／Playerのガイド、Player／Complete ZIPを生成。現在のEntityを1回だけ掲載し、内部情報の不掲載を確認。

編集React ComponentやZustand StoreをこのFixtureは利用しません。Publisherの既存React静的SVG描画とDOMPurify用JSDOMは利用します。PNGテストは画像化の入力SVGを検査するための差替えを使っており、実PNG生成そのものは次のブラウザ検証で確認しました。

## ブラウザ検証

Production Buildをローカルで起動し、既存テスト用データを維持した状態で確認しました。[観測値](browser-results.json)を保存しています。

- 既存4部屋・3 Encounter・10 Entity・4 Factionを正常読込。
- Content／Dungeon Theme／Room Theme／Faction／Encounterの各Libraryへ、`Phase2.5監査`という識別名で1定義ずつ新規保存。以前の定義は維持。
- 部屋全体複製でEntity・必須由来・Encounter・Binding・新由来IDを確認。Encounterだけの削除で4 Entityが残り、Undoで復元。
- 新Roomを配置・回転し、既存部屋と接続。通路の床・グリッド・壁を確認。
- 新Dungeon Themeを適用。部屋にRoom Themeを適用し、条件競合を明示確認して必須Objectを配置。
- 新Faction Instance・友好関係・Room単独支配を設定。
- 候補不足とテーマ除外の診断を表示し、Role・Content・数量3／1を手動選択。例外を確認してプレビュー後にEncounterと2 Entityを一括適用。
- Encounter削除とUndo、既存Faction削除時の支配・関係・所属解除、Encounterと未解決Roleの保持、Undoによる復元を確認。
- 制作途中のJSONに5部屋・1接続・13 Entity・4 Encounter・5 Faction・6 Encounter由来を確認。
- Player ZIP **5ファイル**、Complete ZIP **19ファイル**を実際にダウンロード。Player全体とCompleteのPlayer側・README・manifestに内部名・ID・GM識別文字列がないことを検査。Complete JSONの制作データを確認し、GMガイドに編集済み状況を掲載。
- 検証用のDocument変更をUndoで戻して保存し、ページを再読み込み。元の4部屋・0接続・3 Encounter・10 Entity・4 Factionへ復元。元の保存済み制作内容は保持。
- 最終版で、同じ条件警告が1回だけ表示されることを確認。メイン画面のエラーログは0件。

ファイルアップロードによるImport、Libraryの恒久削除、空Libraryの別ブラウザへのImport、物理印刷／PDF保存ダイアログは実行していません。Importと空Library復元・元定義削除後の保持は自動テストで確認しました。未実行操作をブラウザ成功として数えていません。

## 性能

[性能資料](performance.md)と前後のJSONに、環境・固定データ・方法・全計測値を記録しました。上限に合わせて10／50／100部屋、30／250／500 Entity、5／30／80 Encounterを使用しています。

検証とコピーの追加により100部屋の読込は約3.64→9.60 ms、Exportは約7.11→12.67 msに増えました。必要な保全処理のコストとして明示し、速度改善とは扱いません。Routingのキャッシュは約0.08 msで維持され、シナリオ情報変更による再探索を回帰テストで防いでいます。新しい履歴エンジンや全体ハッシュ置換は行っていません。

起動は不変の変更前コミットから別途Production Buildして交互に比較。観測往復時間込みの中央値は1,146→1,137 msで、明確な改善効果を主張しません。初回キャッシュ差を含む詳細は[startup-browser.json](startup-browser.json)を参照してください。

## 残存する制約・次期開発

- 同一Dungeonを複数メイン編集画面で同時保存する場合、既存の最後の保存が優先されます。LibraryのCASとは別です。共同編集・Document全体のCAS／マージ方式は契約とUXを伴うため、今回無断で変更していません。並行編集時の上書きリスクが残ります。
- 全体検証は構造・参照・既存のサイズ制限を確認しますが、衝突のない配置、Routing成功、出版可能な寸法やページ数までは保証しません。Generatorは既存の衝突・Scene・出版Issueを別途確認する必要があります。
- 全モデルの既存文字列診断を全面的にコードへ置換していません。新しいGeneratorの直接利用で問題になるEncounterの分岐を先に整理し、旧APIを維持しました。
- 最大50個の履歴、Document全体の検証・コピー、Encounter revisionの全体比較には規模に応じた負荷があります。履歴のヒープ実測や大規模上限の拡大は未実施です。
- プレビューで一時Entityを生成する既存必須配置／Encounterの検証にはUUID発行が含まれます。純粋Resolverは非決定要因を持たず、Factoryの既定ID・メタデータ時刻は既存方式のままです。
- 全LibraryのJSON共通化、全フォームの統合、Piece参照保護やDungeon部分保存の汎用Repository化は、固有の責務と変更リスクを考慮して実施していません。

次期開発では、入力Library Snapshotと結果形式・警告方針を決定し、PRNG／重み付き抽選とID・時刻の注入範囲を設計した後、論理接続グラフ→衝突のない部屋配置→Routing→Faction領域→Encounter充足→全体検証の順で進めることを推奨します。既存Document、Factory、Resolver、Repository、Publisherを再利用できます。

## 完了条件

ベースライン・監査・計画・修正・全体検証・非UI統合・既存互換性・単一履歴・公開分離・性能記録・ブラウザ確認・API一覧・現行設計を揃えました。通常Documentを出力するGeneratorの接続先は確認済みです。生成契約・乱数・自動選択・自動配置は次期仕様の対象であり、今回実装済みとはしていません。

## 変更ファイル


実装:

- [src/components/encounters/EncounterApplication.tsx](../../src/components/encounters/EncounterApplication.tsx)
- [src/components/encounters/RoomEncounterPanel.tsx](../../src/components/encounters/RoomEncounterPanel.tsx)
- [src/components/ui/MenuBar.tsx](../../src/components/ui/MenuBar.tsx)
- [src/editor/collision/collisionDetection.ts](../../src/editor/collision/collisionDetection.ts)
- [src/model/diagnostic.ts](../../src/model/diagnostic.ts)
- [src/model/dungeonCommands.ts](../../src/model/dungeonCommands.ts)
- [src/model/dungeonFactory.ts](../../src/model/dungeonFactory.ts)
- [src/model/dungeonValidation.ts](../../src/model/dungeonValidation.ts)
- [src/model/encounter/application.ts](../../src/model/encounter/application.ts)
- [src/model/encounter/resolver.ts](../../src/model/encounter/resolver.ts)
- [src/model/factionResolver.ts](../../src/model/factionResolver.ts)
- [src/model/index.ts](../../src/model/index.ts)
- [src/model/normalizeDungeon.ts](../../src/model/normalizeDungeon.ts)
- [src/model/roomThemeResolver.ts](../../src/model/roomThemeResolver.ts)
- [src/model/selectionSets.ts](../../src/model/selectionSets.ts)
- [src/repository/contentRepository.ts](../../src/repository/contentRepository.ts)
- [src/repository/definitionRepository.ts](../../src/repository/definitionRepository.ts)
- [src/repository/dungeonRepository.ts](../../src/repository/dungeonRepository.ts)
- [src/repository/encounterRepository.ts](../../src/repository/encounterRepository.ts)
- [src/repository/factionRepository.ts](../../src/repository/factionRepository.ts)
- [src/repository/roomThemeRepository.ts](../../src/repository/roomThemeRepository.ts)
- [src/repository/themeRepository.ts](../../src/repository/themeRepository.ts)
- [src/store/dungeonStore.ts](../../src/store/dungeonStore.ts)
- [src/utils/exportImport.ts](../../src/utils/exportImport.ts)

検証:

- [tests/architecture.test.ts](../../tests/architecture.test.ts)
- [tests/dungeonCommands.test.ts](../../tests/dungeonCommands.test.ts)
- [tests/dungeonValidation.test.ts](../../tests/dungeonValidation.test.ts)
- [tests/encounterDiagnostics.test.ts](../../tests/encounterDiagnostics.test.ts)
- [tests/fixtures/auditDataset.ts](../../tests/fixtures/auditDataset.ts)
- [tests/fixtures/integratedScenario.ts](../../tests/fixtures/integratedScenario.ts)
- [tests/integratedScenario.test.ts](../../tests/integratedScenario.test.ts)

計測:

- [scripts/phase25-benchmark.ts](../../scripts/phase25-benchmark.ts)

資料:

- [docs/content-library.md](../../docs/content-library.md)
- [docs/dungeon-themes.md](../../docs/dungeon-themes.md)
- [docs/encounter-templates.md](../../docs/encounter-templates.md)
- [docs/factions.md](../../docs/factions.md)
- [docs/phase-2-5/architecture.md](../../docs/phase-2-5/architecture.md)
- [docs/phase-2-5/audit.md](../../docs/phase-2-5/audit.md)
- [docs/phase-2-5/baseline.json](../../docs/phase-2-5/baseline.json)
- [docs/phase-2-5/browser-results.json](../../docs/phase-2-5/browser-results.json)
- [docs/phase-2-5/interfaces.md](../../docs/phase-2-5/interfaces.md)
- [docs/phase-2-5/performance-after.json](../../docs/phase-2-5/performance-after.json)
- [docs/phase-2-5/performance-before.json](../../docs/phase-2-5/performance-before.json)
- [docs/phase-2-5/performance.md](../../docs/phase-2-5/performance.md)
- [docs/phase-2-5/results.md](../../docs/phase-2-5/results.md)
- [docs/phase-2-5/startup-browser.json](../../docs/phase-2-5/startup-browser.json)
- [docs/phase-2-5/verification.json](../../docs/phase-2-5/verification.json)
- [docs/room-themes.md](../../docs/room-themes.md)

[README.md](../../README.md)にも現行基盤への案内を追加しました。
