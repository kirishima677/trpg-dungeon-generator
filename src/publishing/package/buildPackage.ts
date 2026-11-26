import type { DungeonDocument } from '../../model/types';
import { svgToPng } from '../exporters';
import { createArtifactGenerator } from './artifactGenerator';
import type { PackageSettings } from './artifactGenerator';
import { ARTIFACT_LABELS, buildPackagePlan, MAX_PACKAGE_TOTAL_BYTES, packageFilename } from './packagePlan';
import type { PackageArtifact, PackageProfile } from './packagePlan';
import { packageArtifact, packageManifest, packageReadme, validateManifest, validatePackageArtifacts } from './packageFiles';
import { buildZip, checkAbort, packageBoundary } from './zipBuilder';

export interface PackageBuildProgress {
  phase: 'preparing' | 'generating' | 'validating' | 'compressing' | 'completed';
  completedArtifacts: number; totalArtifacts: number; currentArtifact?: string;
}
export interface PackageBuildOptions { signal?: AbortSignal; onProgress?: (value: PackageBuildProgress) => void; allowIncomplete?: boolean }
export interface PackageBuildResult { blob: Blob; filename: string; fileCount: number; uncompressedBytes: number; warnings: string[] }
export function createPackageBuilder(dependencies: { png?: typeof svgToPng; zip?: typeof buildZip } = {}) {
  let running = false;
  return { get busy() { return running; }, async build(snapshot: DungeonDocument, profile: PackageProfile, settings: PackageSettings, options: PackageBuildOptions = {}): Promise<PackageBuildResult> {
    if (running) throw new Error('出版パッケージを生成中です。完了またはキャンセルを待ってください。');
    running = true;
    const signal = options.signal, onProgress = options.onProgress, allowIncomplete = options.allowIncomplete === true;
    try {
      checkAbort(signal);
      // Capture every input before the first await; later editor/library/settings changes cannot enter the job.
      const source = structuredClone(snapshot), selected = structuredClone(profile), config = structuredClone(settings);
      const plan = buildPackagePlan(selected, source), createdAt = new Date().toISOString(), total = plan.artifacts.length;
      const notify = (phase: PackageBuildProgress['phase'], completedArtifacts: number, currentArtifact?: string) => onProgress?.({ phase, completedArtifacts, totalArtifacts: total, currentArtifact });
      notify('preparing', 0);
      await packageBoundary(signal);
      const generator = createArtifactGenerator(source, config, selected.title.trim(), allowIncomplete, dependencies.png, createdAt);
      const files: PackageArtifact[] = [];
      let generatedBytes = 0;
      for (const request of plan.artifacts.filter(r => r.kind !== 'readme' && r.kind !== 'manifest')) {
        notify('generating', files.length, request.path);
        await packageBoundary(signal);
        try { files.push(await generator.generate(request)); }
        catch (e) { checkAbort(signal); throw new Error(`${request.path}（${ARTIFACT_LABELS[request.kind as keyof typeof ARTIFACT_LABELS]}）: ${e instanceof Error ? e.message : '生成に失敗しました。'}`); }
        checkAbort(signal);
        const file = files.at(-1)!;
        validatePackageArtifacts(plan, [file], false);
        generatedBytes += file.sizeBytes;
        if (generatedBytes > MAX_PACKAGE_TOTAL_BYTES) throw new Error('圧縮前の総データが96MiBを超えています。');
        notify('generating', files.length, request.path);
      }
      notify('validating', files.length); await packageBoundary(signal);
      const readme = plan.artifacts.find(r => r.kind === 'readme'), manifest = plan.artifacts.find(r => r.kind === 'manifest')!;
      const warnings = [...generator.warnings];
      if (readme) { files.push(packageArtifact(readme, packageReadme(selected, files, warnings))); notify('validating', files.length, readme.path); }
      files.push(packageArtifact(manifest, packageManifest(selected, files, createdAt, warnings)));
      notify('validating', files.length, manifest.path);
      const uncompressedBytes = validatePackageArtifacts(plan, files); validateManifest(files);
      notify('compressing', total); await packageBoundary(signal);
      const blob = await (dependencies.zip ?? buildZip)(files, signal);
      checkAbort(signal);
      notify('completed', total);
      return { blob, filename: packageFilename(selected), fileCount: files.length, uncompressedBytes, warnings };
    } finally { running = false; }
  } };
}
