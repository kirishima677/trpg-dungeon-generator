# 出版成果物の変更前基準

`publication-baseline.json` は、リファクタリング前の `abc7816` のコードを独立した一時ディレクトリへ展開し、`publicationFixture.ts` の固定入力で生成したSHA-256です。時刻は `2026-11-26T00:00:00.000Z` に固定しています。

GM／PlayerのSVG、ガイド、シナリオ印刷、参照用・卓上用マップ、ピースシート、数量CSV、Project／Piece JSONの16ファイルを対象にしています。PNGは同じSVGから既存の変換処理へ渡し、別途ブラウザと変換処理のテストで確認します。

期待値は現行コードから自動更新しません。意図した出力仕様変更時には、差分と公開範囲を確認したうえで明示的に更新してください。

Entity配置対応ではDungeon JSONを1.3へ拡張しました。元の16件のハッシュは変更していません。15成果物は直接バイト一致を検査し、`project/dungeon.json`だけは`publicationBaselineData.ts`で1.3のバージョンと空の`entities`を検査した後、その3点を1.2へ戻した内容を旧ハッシュと照合します。スキーマ以外の差分を許容する変換ではありません。Entityを含む新しいJSONの復元と公開範囲は`entities.test.ts` / `entityPublishing.test.ts`で別途検査します。
