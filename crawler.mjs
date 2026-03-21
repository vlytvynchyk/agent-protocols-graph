#!/usr/bin/env node
/**
 * Knowledge Graph Crawler
 *
 * Fetches monitored URLs, detects changes, and appends timeline entries
 * to the knowledge graph data.
 *
 * Usage:
 *   node crawler.mjs                  # crawl all sources
 *   node crawler.mjs --topic mcp      # crawl sources for a specific topic
 *   node crawler.mjs --url <url>      # crawl a specific URL and auto-assign
 *   node crawler.mjs --list           # list all monitored sources
 *   node crawler.mjs --add-source <topic-id> <url>  # add a source URL to a topic
 *   node crawler.mjs --daemon                       # run every 24h automatically
 *   node crawler.mjs --discover                     # auto-discover new source URLs
 *   node crawler.mjs --digest                       # generate daily digest markdown
 *   node crawler.mjs --discord <webhook-url>        # post digest to Discord
 *
 * The graph data file path defaults to ./knowledge-graph-data.json
 * Use --data <path> to specify a different file.
 *
 * How it works:
 *   1. Reads knowledge-graph-data.json (exported from the UI)
 *   2. For each node with `sources` URLs, fetches the page
 *   3. Compares content hash with previous crawl
 *   4. If changed, adds a timeline entry with the date and a diff summary
 *   5. Writes updated data back (re-import into the UI)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================
// CONFIG
// ============================================================
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--topic') flags.topic = args[++i];
  else if (args[i] === '--url') flags.url = args[++i];
  else if (args[i] === '--data') flags.data = args[++i];
  else if (args[i] === '--list') flags.list = true;
  else if (args[i] === '--add-source') { flags.addSource = { topic: args[++i], url: args[++i] }; }
  else if (args[i] === '--daemon') flags.daemon = true;
  else if (args[i] === '--interval') flags.interval = parseInt(args[++i]) || 24;
  else if (args[i] === '--discover') flags.discover = true;
  else if (args[i] === '--digest') flags.digest = true;
  else if (args[i] === '--discord') flags.discord = args[++i];
  else if (args[i] === '--help' || args[i] === '-h') { printHelp(); process.exit(0); }
}

const DATA_FILE = resolve(flags.data || './knowledge-graph-data.json');
const CACHE_DIR = resolve(__dirname, '.crawl-cache');
const TODAY = new Date().toISOString().slice(0, 10);

// ============================================================
// MAIN
// ============================================================
async function main() {
  // Ensure cache directory
  if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });

  // Load data
  if (!existsSync(DATA_FILE)) {
    console.error(`Data file not found: ${DATA_FILE}`);
    console.error('Export your graph from the UI first, or specify --data <path>');
    process.exit(1);
  }

  let data = JSON.parse(await readFile(DATA_FILE, 'utf-8'));
  console.log(`Loaded ${data.nodes.length} topics from ${DATA_FILE}\n`);

  // --daemon mode
  if (flags.daemon) {
    const hours = flags.interval || 24;
    console.log(`Daemon mode: crawling every ${hours} hour(s). Press Ctrl+C to stop.\n`);
    const run = async () => {
      data = JSON.parse(await readFile(DATA_FILE, 'utf-8'));
      if (flags.discover) await discoverSources(data);
      await crawlAll(data);
    };
    await run();
    setInterval(run, hours * 3600 * 1000);
    return; // keeps process alive
  }

  // --discover
  if (flags.discover) {
    await discoverSources(data);
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('Source discovery complete.\n');
    if (flags.list) { listSources(data); return; }
  }

  // --list
  if (flags.list) {
    listSources(data);
    return;
  }

  // --add-source
  if (flags.addSource) {
    const node = data.nodes.find(n => n.id === flags.addSource.topic);
    if (!node) { console.error(`Topic not found: ${flags.addSource.topic}`); process.exit(1); }
    if (!node.sources) node.sources = [];
    if (!node.sources.includes(flags.addSource.url)) {
      node.sources.push(flags.addSource.url);
      await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      console.log(`Added source ${flags.addSource.url} to "${node.label}"`);
    } else {
      console.log('Source already exists for this topic.');
    }
    return;
  }

  // Determine which nodes to crawl
  let nodesToCrawl = data.nodes.filter(n => n.sources && n.sources.length > 0);
  if (flags.topic) {
    nodesToCrawl = nodesToCrawl.filter(n => n.id === flags.topic);
    if (!nodesToCrawl.length) { console.error(`Topic not found or has no sources: ${flags.topic}`); process.exit(1); }
  }

  if (flags.url) {
    // Find which topic owns this URL, or crawl standalone
    const ownerNode = data.nodes.find(n => n.sources && n.sources.includes(flags.url));
    if (ownerNode) {
      nodesToCrawl = [ownerNode];
      // Only crawl the specified URL
      ownerNode._crawlUrls = [flags.url];
    } else {
      console.log(`URL not assigned to any topic. Use --add-source <topic-id> <url> first.`);
      process.exit(1);
    }
  }

  if (!nodesToCrawl.length) {
    console.log('No topics have source URLs. Add sources in the UI or with --add-source.');
    return;
  }

  console.log(`Crawling ${nodesToCrawl.length} topic(s)...\n`);
  let totalNew = 0;

  for (const node of nodesToCrawl) {
    const urls = node._crawlUrls || node.sources;
    console.log(`--- ${node.label} (${node.id}) ---`);

    for (const url of urls) {
      try {
        const result = await crawlUrl(url);
        if (result.changed) {
          console.log(`  CHANGED: ${url}`);
          console.log(`    Title: ${result.title}`);
          console.log(`    Size: ${result.size} chars (was ${result.prevSize || 'unknown'})`);

          if (!node.timeline) node.timeline = [];

          // Don't add duplicate entries for same URL on same day
          const exists = node.timeline.some(t => t.source === url && t.date === TODAY);
          if (!exists) {
            node.timeline.push({
              date: TODAY,
              title: `Content updated: ${result.title || url}`,
              desc: result.summary,
              source: url,
              tag: result.isNew ? 'new' : 'update',
            });
            totalNew++;
            console.log(`    -> Timeline entry added`);
          } else {
            console.log(`    -> Already logged today, skipped`);
          }
        } else {
          console.log(`  unchanged: ${url}`);
        }
      } catch (e) {
        console.log(`  ERROR: ${url} - ${e.message}`);
      }
    }
    console.log();
  }

  // Save
  if (totalNew > 0) {
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Saved ${totalNew} new timeline entries to ${DATA_FILE}`);
    console.log('Import this file back into the Knowledge Graph UI.');
  } else {
    console.log('No changes detected.');
  }

  // Generate digest
  if (flags.digest || flags.discord) {
    await generateDigest(data, totalNew);
  }
}

// ============================================================
// CRAWL URL
// ============================================================
async function crawlUrl(url) {
  const cacheFile = resolve(CACHE_DIR, hashStr(url) + '.json');
  let prev = null;
  try { prev = JSON.parse(await readFile(cacheFile, 'utf-8')); } catch {}

  // Fetch
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'KnowledgeGraphCrawler/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body = await resp.text();

  // Extract title
  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = body.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : (h1Match ? h1Match[1].trim() : '');

  // Strip HTML to get text content for comparison
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hash = hashStr(text);
  const isNew = !prev;
  const changed = isNew || prev.hash !== hash;

  // Generate summary
  let summary = '';
  if (isNew) {
    summary = `First crawl. Page has ${text.length} characters of content.`;
  } else if (changed) {
    const sizeDiff = text.length - (prev.size || 0);
    const direction = sizeDiff > 0 ? 'grew' : 'shrunk';
    summary = `Content ${direction} by ${Math.abs(sizeDiff)} chars (${prev.size} -> ${text.length}).`;

    // Try to find new sections by comparing headings
    const prevHeadings = extractHeadings(prev.text || '');
    const currHeadings = extractHeadings(text);
    const newHeadings = currHeadings.filter(h => !prevHeadings.includes(h));
    if (newHeadings.length) {
      summary += ` New sections: ${newHeadings.slice(0, 5).join(', ')}`;
    }
  }

  // Save cache
  await writeFile(cacheFile, JSON.stringify({
    url,
    hash,
    size: text.length,
    title,
    text: text.slice(0, 10000), // keep first 10k for diffing
    lastCrawl: TODAY,
  }));

  return {
    changed,
    isNew,
    title,
    size: text.length,
    prevSize: prev?.size,
    summary,
  };
}

function extractHeadings(text) {
  // Rough heading extraction from plain text (lines that look like headers)
  return text.split(/\s{2,}/)
    .filter(s => s.length > 5 && s.length < 100)
    .slice(0, 50);
}

function hashStr(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// ============================================================
// CRAWL ALL (reusable for daemon mode)
// ============================================================
async function crawlAll(data) {
  let nodesToCrawl = data.nodes.filter(n => n.sources && n.sources.length > 0);
  if (flags.topic) {
    nodesToCrawl = nodesToCrawl.filter(n => n.id === flags.topic);
  }
  if (!nodesToCrawl.length) {
    console.log('No topics have source URLs.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[${today}] Crawling ${nodesToCrawl.length} topic(s)...\n`);
  let totalNew = 0;

  for (const node of nodesToCrawl) {
    const urls = node.sources;
    console.log(`--- ${node.label} (${node.id}) ---`);
    for (const url of urls) {
      try {
        const result = await crawlUrl(url);
        if (result.changed) {
          console.log(`  CHANGED: ${url} - ${result.title}`);
          if (!node.timeline) node.timeline = [];
          const exists = node.timeline.some(t => t.source === url && t.date === today);
          if (!exists) {
            node.timeline.push({
              date: today,
              title: `Content updated: ${result.title || url}`,
              desc: result.summary,
              source: url,
              tag: result.isNew ? 'new' : 'update',
            });
            totalNew++;
          }
        } else {
          console.log(`  unchanged: ${url}`);
        }
      } catch (e) {
        console.log(`  ERROR: ${url} - ${e.message}`);
      }
    }
  }

  if (totalNew > 0) {
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`\nSaved ${totalNew} new timeline entries.`);
  } else {
    console.log('\nNo changes detected.');
  }
}

// ============================================================
// AUTO-DISCOVER SOURCES
// ============================================================
// Well-known source URLs mapped to topic keywords for auto-assignment
const WELL_KNOWN_SOURCES = {
  'https://blog.modelcontextprotocol.io/': ['mcp', 'mcp-instructions', 'mcp-bundles', 'mcp-apps', 'skills'],
  'https://spec.modelcontextprotocol.io/': ['mcp'],
  'https://modelcontextprotocol.io/docs/learn/architecture': ['mcp', 'mcp-transport'],
  'https://modelcontextprotocol.io/docs/learn/client-concepts': ['mcp-sampling', 'mcp-elicitation'],
  'https://modelcontextprotocol.io/docs/concepts/transports': ['mcp-transport'],
  'https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization.md': ['mcp-auth'],
  'https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks.md': ['mcp-tasks'],
  'https://modelcontextprotocol.io/specification/2025-11-25/server/tools.md': ['mcp', 'structured-output', 'agent-security'],
  'https://a2a-protocol.org/': ['a2a', 'mcp-a2a'],
  'https://agentskills.io/': ['skills', 'skills-over-mcp'],
  'https://github.com/modelcontextprotocol/experimental-ext-skills': ['skills-over-mcp', 'skills'],
  'https://github.com/google/a2ui': ['a2ui'],
  'https://github.com/modelcontextprotocol/modelcontextprotocol': ['mcp'],
  'https://github.com/modelcontextprotocol/ext-auth': ['mcp-auth'],
  'https://github.com/modelcontextprotocol/registry': ['skills-over-mcp'],
  'https://github.com/agentskills/agentskills': ['skills'],
  'https://github.com/anthropics/skills': ['skills'],
  'https://gofastmcp.com/': ['skills', 'mcp', 'agent-frameworks'],
  'https://github.com/cloudflare/agent-skills-discovery-rfc': ['skills-over-mcp'],
  'https://github.com/langchain-ai/langgraph': ['agent-frameworks'],
  'https://github.com/crewAIInc/crewAI': ['agent-frameworks'],
  'https://github.com/pydantic/pydantic-ai': ['agent-frameworks'],
};

async function discoverSources(data) {
  console.log('Auto-discovering sources...\n');
  let added = 0;

  for (const [url, topicIds] of Object.entries(WELL_KNOWN_SOURCES)) {
    for (const topicId of topicIds) {
      const node = data.nodes.find(n => n.id === topicId);
      if (!node) continue;
      if (!node.sources) node.sources = [];
      if (!node.sources.includes(url)) {
        node.sources.push(url);
        console.log(`  + ${url} -> ${node.label}`);
        added++;
      }
    }
  }

  // Also try to discover links from existing sources (extract hrefs from cached pages)
  for (const node of data.nodes) {
    if (!node.sources) continue;
    for (const sourceUrl of [...node.sources]) {
      const cacheFile = resolve(CACHE_DIR, hashStr(sourceUrl) + '.json');
      try {
        const cached = JSON.parse(await readFile(cacheFile, 'utf-8'));
        // Extract URLs that look like blog posts or specs
        const urlMatches = (cached.text || '').match(/https?:\/\/[^\s"'<>]+/g) || [];
        for (const found of urlMatches) {
          const clean = found.replace(/[.,;)}\]]+$/, '');
          // Only add if it matches known patterns
          if (
            (clean.includes('modelcontextprotocol.io/posts/') ||
             clean.includes('a2a-protocol.org/latest/') ||
             clean.includes('agentskills.io/')) &&
            !node.sources.includes(clean)
          ) {
            node.sources.push(clean);
            console.log(`  + ${clean} -> ${node.label} (discovered from ${sourceUrl})`);
            added++;
          }
        }
      } catch {}
    }
  }

  console.log(`\nDiscovered ${added} new source URL(s).`);
}

// ============================================================
// LIST
// ============================================================
function listSources(data) {
  let count = 0;
  data.nodes.forEach(n => {
    if (n.sources && n.sources.length) {
      console.log(`${n.id} (${n.label}):`);
      n.sources.forEach(s => { console.log(`  ${s}`); count++; });
      console.log();
    }
  });
  console.log(`Total: ${count} source URL(s) across ${data.nodes.filter(n=>n.sources?.length).length} topic(s)`);
}

// ============================================================
// HELP
// ============================================================
function printHelp() {
  console.log(`
Knowledge Graph Crawler - Monitor URLs and track changes in your learning graph

USAGE:
  node crawler.mjs                              Crawl all sources
  node crawler.mjs --topic <id>                 Crawl sources for one topic
  node crawler.mjs --url <url>                  Crawl a specific URL
  node crawler.mjs --list                       List all monitored sources
  node crawler.mjs --add-source <topic> <url>   Add a source URL to a topic
  node crawler.mjs --discover                   Auto-discover new source URLs
  node crawler.mjs --daemon                     Run continuously (every 24h)
  node crawler.mjs --daemon --interval 6        Run every 6 hours
  node crawler.mjs --digest                       Generate daily digest to digests/
  node crawler.mjs --discord <webhook-url>        Post digest to Discord channel
  node crawler.mjs --daemon --discover          Auto-discover + crawl on schedule
  node crawler.mjs --data <path>                Use a different data file

AUTO-DISCOVERY:
  The crawler has a built-in map of well-known URLs for each topic
  (MCP blog, A2A spec, Agent Skills spec, etc.) and can also discover
  new URLs from links found in previously crawled pages.

DAEMON MODE:
  Runs in the background, crawling at the specified interval.
  Combine with --discover to also auto-extend the source list.
  The updated data file can be re-imported into the UI at any time.

EXAMPLES:
  node crawler.mjs --discover --list            Discover sources and list them
  node crawler.mjs                              Crawl everything once
  node crawler.mjs --daemon --discover          Run 24/7 with auto-discovery
  node crawler.mjs --add-source mcp https://blog.modelcontextprotocol.io/
  node crawler.mjs --topic skills
`);
}

// ============================================================
// DAILY DIGEST
// ============================================================
const DIGEST_DIR = resolve(__dirname, 'digests');

async function generateDigest(data, changesCount) {
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = [];

  data.nodes.forEach(node => {
    if (!node.timeline) return;
    node.timeline.forEach(entry => {
      if (entry.date === today) {
        todayEntries.push({ topic: node.label, topicId: node.id, ...entry });
      }
    });
  });

  // Stats
  const totalTopics = data.nodes.length;
  const withSources = data.nodes.filter(n => n.sources && n.sources.length).length;
  const totalSources = data.nodes.reduce((sum, n) => sum + (n.sources?.length || 0), 0);

  // Build markdown
  let md = `# Daily Digest — ${today}\n\n`;
  md += `**${changesCount}** change(s) detected across **${withSources}** monitored topics (${totalSources} URLs)\n\n`;

  if (todayEntries.length === 0) {
    md += `No updates today. All monitored sources are unchanged.\n`;
  } else {
    md += `## Changes\n\n`;
    todayEntries.forEach(e => {
      md += `### ${e.topic}\n`;
      md += `- **${e.title}**\n`;
      md += `  ${e.desc || ''}\n`;
      if (e.source) md += `  Source: ${e.source}\n`;
      md += `\n`;
    });
  }

  // Topics without sources (could be monitored)
  const unmonitored = data.nodes.filter(n => !n.sources || !n.sources.length);
  if (unmonitored.length) {
    md += `## Unmonitored Topics\n\n`;
    md += unmonitored.map(n => `- ${n.label}`).join('\n') + '\n';
    md += `\n_Run \`node crawler.mjs --discover\` to auto-add sources._\n`;
  }

  // Write file
  if (flags.digest) {
    if (!existsSync(DIGEST_DIR)) await mkdir(DIGEST_DIR, { recursive: true });
    const digestFile = resolve(DIGEST_DIR, `${today}.md`);
    await writeFile(digestFile, md);
    console.log(`\nDigest written to ${digestFile}`);
  }

  // Post to Discord
  if (flags.discord) {
    await postToDiscord(flags.discord, todayEntries, changesCount, today);
  }
}

async function postToDiscord(webhookUrl, entries, changesCount, today) {
  const embeds = [{
    title: `📡 Knowledge Graph Digest — ${today}`,
    color: changesCount > 0 ? 0x58a6ff : 0x484f58,
    description: `**${changesCount}** change(s) detected today.`,
    fields: [],
    footer: { text: 'Knowledge Graph Crawler' },
    timestamp: new Date().toISOString(),
  }];

  if (entries.length > 0) {
    entries.slice(0, 10).forEach(e => {
      let value = e.desc || 'Content updated';
      if (e.source) value += `\n[View source](${e.source})`;
      embeds[0].fields.push({
        name: `${e.topic}: ${e.title}`,
        value: value.slice(0, 1024),
        inline: false,
      });
    });
  } else {
    embeds[0].description += '\n_No updates today. All sources unchanged._';
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });
    if (res.ok || res.status === 204) {
      console.log('Digest posted to Discord.');
    } else {
      console.error(`Discord webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (e) {
    console.error(`Failed to post to Discord: ${e.message}`);
  }
}

// ============================================================
main().catch(e => { console.error(e); process.exit(1); });
