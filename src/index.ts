import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

interface AuditFinding {
  id: string;
  severity: 'success' | 'warning' | 'error';
  category: string;
  title: string;
  detail?: string;
  recommendation?: string;
}

interface AuditResponse {
  ok: boolean;
  error?: string;
  report?: {
    scores?: {
      overall: number;
      structure: number;
      links: number;
      bestPractices: number;
    };
    findings?: AuditFinding[];
    document?: {
      title?: string;
      summary?: string;
      sections?: Array<{
        name: string;
        optional: boolean;
        links: Array<{ text: string; url: string; desc?: string }>;
      }>;
    };
  };
  linkStats?: {
    total: number;
    ok: number;
    broken: number;
    redirect: number;
    skipped?: number;
  };
  specialist?: {
    metrics?: {
      estimatedTokens: number;
      wordCount: number;
      tokenStatus: string;
      tokenRecommendation: string;
    };
    dualFileParity?: {
      hasCompanion: boolean;
      companionRecommendation: string;
    };
  };
}

interface LinkProbeResult {
  title: string;
  url: string;
  statusType: 'ok' | 'redirect' | 'broken' | 'timeout';
  statusCode: number;
  statusMessage: string;
  latencyMs: number;
  finalUrl?: string;
  isRedirect?: boolean;
}

interface LinkProbeResponse {
  ok: boolean;
  healthScore: number;
  totalAudited: number;
  totalInputCount: number;
  isTruncated: boolean;
  summary: {
    okCount: number;
    redirectCount: number;
    brokenCount: number;
    timeoutCount: number;
  };
  results: LinkProbeResult[];
  error?: string;
}

interface SynthesizeResponse {
  ok: boolean;
  title: string;
  linkCount: number;
  fullContent: string;
  metrics: {
    estimatedTokens: number;
    wordCount: number;
    fitsGpt4o: boolean;
    fitsClaudeSonnet: boolean;
    fitsGemini: boolean;
  };
  error?: string;
}

async function run(): Promise<void> {
  try {
    const inputPath = core.getInput('path') || './llms.txt';
    const checkLinks = core.getBooleanInput('check-links');
    const failOnBroken = core.getBooleanInput('fail-on-broken-links');
    const failOnErrors = core.getBooleanInput('fail-on-errors');
    const generateFull = core.getBooleanInput('generate-full');
    const outputFullPath = core.getInput('output-full') || './llms-full.txt';
    const rawApiUrl = core.getInput('api-url') || 'https://linten.apps.loopstates.com';
    const apiUrl = rawApiUrl.replace(/\/$/, '');

    core.info(`🔍 Linten GitHub Action — Initializing audit for ${inputPath}`);

    // 1. Locate llms.txt
    let resolvedPath = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(resolvedPath)) {
      const candidates = [
        path.resolve(process.cwd(), './public/llms.txt'),
        path.resolve(process.cwd(), './docs/llms.txt'),
        path.resolve(process.cwd(), './static/llms.txt'),
        path.resolve(process.cwd(), './llms.txt'),
      ];
      const found = candidates.find((c) => fs.existsSync(c));
      if (found) {
        core.info(`ℹ️ File not found at ${inputPath}. Found fallback at ${found}`);
        resolvedPath = found;
      } else {
        throw new Error(
          `Could not locate llms.txt at ${inputPath} or standard fallback directories (./public, ./docs, ./static).`,
        );
      }
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    if (!content.trim()) {
      throw new Error(`File at ${resolvedPath} is empty.`);
    }

    core.info(`📄 Read ${content.length} characters from ${resolvedPath}`);

    // 2. Perform Spec v2 AST Audit
    core.info(`🌐 Calling Linten Cloud Audit API (${apiUrl}/api/validate)...`);
    const auditRes = await fetch(`${apiUrl}/api/validate?source=github-action`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Linten-GitHub-Action/1.0 (+https://loopstates.com)',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!auditRes.ok && auditRes.status !== 400) {
      throw new Error(`Linten Cloud API error (HTTP ${auditRes.status}): ${auditRes.statusText}`);
    }

    const auditData = (await auditRes.json()) as AuditResponse;
    const report = auditData.report;
    const scores = report?.scores;
    const overallScore = scores?.overall ?? 0;
    const findings = report?.findings ?? [];
    const estimatedTokens = auditData.specialist?.metrics?.estimatedTokens ?? Math.round(content.length / 4);

    core.info(`📊 Quality Score: ${overallScore}/100 (~${estimatedTokens.toLocaleString()} tokens)`);

    // 3. Optional Link Health Probing
    let linkData: LinkProbeResponse | null = null;
    if (checkLinks) {
      core.info(`🔗 Probing declared documentation links via Linten Cloud...`);
      try {
        const linkRes = await fetch(`${apiUrl}/api/check-links?source=github-action`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Linten-GitHub-Action/1.0 (+https://loopstates.com)',
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ content }),
        });

        if (linkRes.ok) {
          linkData = (await linkRes.json()) as LinkProbeResponse;
          core.info(
            `✅ Link Probe Complete: ${linkData.summary.okCount} OK, ${linkData.summary.redirectCount} redirects, ${linkData.summary.brokenCount} broken`,
          );
        }
      } catch (err: unknown) {
        core.warning(`Link probe encountered a transient network issue: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 4. Optional Companion llms-full.txt Compilation
    let fullArchiveWritten = false;
    if (generateFull) {
      core.info(`⚡ Compiling companion llms-full.txt archive via Linten Cloud...`);
      try {
        const synthRes = await fetch(`${apiUrl}/api/v1/synthesize?source=github-action`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Linten-GitHub-Action/1.0 (+https://loopstates.com)',
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ content }),
        });

        if (synthRes.ok) {
          const synthData = (await synthRes.json()) as SynthesizeResponse;
          if (synthData.ok && synthData.fullContent) {
            const outResolved = path.resolve(process.cwd(), outputFullPath);
            fs.mkdirSync(path.dirname(outResolved), { recursive: true });
            fs.writeFileSync(outResolved, synthData.fullContent, 'utf8');
            fullArchiveWritten = true;
            core.info(`💾 Synthesized companion archive written to ${outputFullPath} (${synthData.fullContent.length} bytes)`);
            core.setOutput('full-archive-path', outputFullPath);
          }
        }
      } catch (err: unknown) {
        core.warning(`Companion archive synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 5. Calculate Metrics & Status
    const errorCount = findings.filter((f) => f.severity === 'error').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const brokenLinkCount = linkData?.summary.brokenCount ?? 0;
    const totalLinks = linkData?.totalAudited ?? auditData.linkStats?.total ?? 0;

    let status = 'pass';
    if (errorCount > 0 || (failOnBroken && brokenLinkCount > 0)) {
      status = 'fail';
    } else if (warningCount > 0 || brokenLinkCount > 0) {
      status = 'warn';
    }

    // 6. Set GitHub Action Outputs
    core.setOutput('score', overallScore.toString());
    core.setOutput('status', status);
    core.setOutput('total-links', totalLinks.toString());
    core.setOutput('broken-links', brokenLinkCount.toString());
    core.setOutput('estimated-tokens', estimatedTokens.toString());

    // 7. Render Rich GitHub Actions Step Summary
    const statusEmoji = status === 'pass' ? '🟢' : status === 'warn' ? '🟡' : '🔴';
    const badgeLabel = status === 'pass' ? 'PASSED' : status === 'warn' ? 'WARNING' : 'FAILED';

    let summary = core.summary
      .addHeading('🔍 Linten: Spec v2 llms.txt Audit Report', 2)
      .addRaw(
        `**Status**: ${statusEmoji} **${badgeLabel}** &nbsp;|&nbsp; **Overall Quality Score**: **${overallScore} / 100** &nbsp;|&nbsp; **File**: \`${path.relative(process.cwd(), resolvedPath)}\`\n\n`,
      );

    // Summary Table
    summary = summary.addTable([
      [
        { data: 'Category', header: true },
        { data: 'Score', header: true },
        { data: 'Benchmark / Status', header: true },
      ],
      ['Spec v2 Structure', `${scores?.structure ?? 0}%`, (scores?.structure ?? 0) >= 80 ? '✅ Compliant' : '⚠️ Action Needed'],
      ['Link Reachability', `${scores?.links ?? 0}%`, brokenLinkCount === 0 ? '✅ 100% Reachable' : `❌ ${brokenLinkCount} Broken`],
      ['AI Agent Best Practices', `${scores?.bestPractices ?? 0}%`, (scores?.bestPractices ?? 0) >= 80 ? '✅ Optimized' : 'ℹ️ Room for Polish'],
    ]);

    // Token Budget Gauge Table
    summary = summary.addHeading('🤖 Frontier AI Token Budget', 3).addTable([
      [
        { data: 'Frontier AI Model', header: true },
        { data: 'Context Window', header: true },
        { data: 'This Manifest Consumption', header: true },
      ],
      ['Google Gemini 2.0 (Flash/Pro)', '2,000,000 tokens', `${((estimatedTokens / 2000000) * 100).toFixed(3)}% (~${estimatedTokens.toLocaleString()} tokens)`],
      ['Anthropic Claude 3.5 Sonnet', '200,000 tokens', `${((estimatedTokens / 200000) * 100).toFixed(2)}%`],
      ['OpenAI GPT-4o', '128,000 tokens', `${((estimatedTokens / 128000) * 100).toFixed(2)}%`],
      ['DeepSeek-V3', '64,000 tokens', `${((estimatedTokens / 64000) * 100).toFixed(2)}%`],
    ]);

    // Link Issues Section (if any)
    if (linkData && (linkData.summary.brokenCount > 0 || linkData.summary.redirectCount > 0)) {
      summary = summary.addHeading('🔗 Link Reachability Findings', 3);
      const rows: Array<[string, string, string, string]> = [
        ['URL', 'Status', 'HTTP Code', 'Latency'],
      ];
      for (const res of linkData.results) {
        if (res.statusType !== 'ok') {
          const typeIcon = res.statusType === 'broken' || res.statusType === 'timeout' ? '❌' : '🔄';
          rows.push([
            `[\`${res.title || res.url}\`](${res.url})`,
            `${typeIcon} ${res.statusType.toUpperCase()}`,
            res.statusCode > 0 ? res.statusCode.toString() : 'TIMEOUT',
            `${res.latencyMs}ms`,
          ]);
        }
      }
      if (rows.length > 1) {
        summary = summary.addTable(
          rows.map((row, idx) =>
            row.map((cell) => (idx === 0 ? { data: cell, header: true } : cell)),
          ) as any,
        );
      }
    }

    // Findings List
    if (findings.length > 0) {
      summary = summary.addHeading('📋 Audit Findings & Recommendations', 3);
      let findingsList = '';
      for (const f of findings) {
        const icon = f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️' : '✅';
        findingsList += `* ${icon} **${f.title}** (${f.category})\n`;
        if (f.detail) findingsList += `  * *Detail*: ${f.detail}\n`;
        if (f.recommendation) findingsList += `  * *Recommendation*: \`${f.recommendation}\`\n`;
      }
      summary = summary.addRaw(findingsList + '\n');
    }

    if (fullArchiveWritten) {
      summary = summary.addRaw(`\n📦 **Companion Archive**: Successfully compiled and written to \`${outputFullPath}\`.\n`);
    }

    summary = summary.addRaw(
      `\n---\n*Audited by [Linten](https://loopstates.com) — Powered by [Loopstates](https://loopstates.com)*\n`,
    );

    if (process.env.GITHUB_STEP_SUMMARY) {
      await summary.write();
    } else {
      core.info('Step summary generated successfully.');
    }

    // 8. Enforce Failure Conditions if Configured
    if (failOnErrors && errorCount > 0) {
      core.setFailed(`Linten audit failed with ${errorCount} Spec v2 structural error(s). Review job summary for details.`);
      return;
    }

    if (failOnBroken && brokenLinkCount > 0) {
      core.setFailed(`Linten link check failed: detected ${brokenLinkCount} broken documentation link(s).`);
      return;
    }

    core.info(`✨ Linten audit completed successfully.`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    core.setFailed(`Linten Action failed: ${msg}`);
  }
}

run();
