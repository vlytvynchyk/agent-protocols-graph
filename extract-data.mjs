#!/usr/bin/env node
/**
 * Extracts the default graph data from knowledge-graph.html
 * so the crawler can work without a manually exported JSON file.
 */
import { readFile, writeFile } from 'fs/promises';

const html = await readFile('./knowledge-graph.html', 'utf-8');

// Extract the defaultData() function body
const match = html.match(/function defaultData\(\)\s*\{[\s\S]*?return\s*(\{[\s\S]*?\});\s*\}/);
if (!match) {
  console.error('Could not find defaultData() in knowledge-graph.html');
  process.exit(1);
}

// Evaluate it (the data is plain object literals, safe to eval)
const data = new Function(`return ${match[1]}`)();

// Ensure arrays exist
data.nodes.forEach(n => {
  if (!n.timeline) n.timeline = [];
  if (!n.sources) n.sources = [];
});

await writeFile('./knowledge-graph-data.json', JSON.stringify(data, null, 2));
console.log(`Extracted ${data.nodes.length} nodes, ${data.edges.length} edges to knowledge-graph-data.json`);
