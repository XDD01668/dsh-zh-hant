import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const templatePath = path.join(root, 'src', 'client.template.js');
const vendorPath = path.join(root, 'vendor', 'opencc.cn2t.umd.cjs');
const outputPath = path.join(root, 'client.js');

const EXPECTED_SIZE = 1100656;
const EXPECTED_SHA256 = 'd66d920069ab526db08c6f2bc15fcf6feb7d07de3cf98e7e27c0aaf7d136baee';
const MARKER = '/*__OPENCC_UMD__*/';

const [template, vendor] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(vendorPath, 'utf8')
]);

const vendorBytes = Buffer.byteLength(vendor, 'utf8');
const vendorSha = createHash('sha256').update(vendor, 'utf8').digest('hex');

if (vendorBytes !== EXPECTED_SIZE) {
  throw new Error(`vendor size mismatch: got ${vendorBytes}, want ${EXPECTED_SIZE}`);
}
if (vendorSha !== EXPECTED_SHA256) {
  throw new Error(`vendor sha256 mismatch: got ${vendorSha}`);
}
if (!vendor.includes('s2hk')) {
  throw new Error('vendor bundle does not expose the s2hk converter');
}
const markerCount = template.split(MARKER).length - 1;
if (markerCount !== 1) {
  throw new Error(`expected exactly one ${MARKER} marker, found ${markerCount}`);
}

const output = template.replace(MARKER, vendor);
if (output.includes(MARKER)) {
  throw new Error('marker survived replacement');
}
if (!output.includes("id: MODULE_ID") || !output.includes("MODULE_ID = '@local/dsh-zh-hant'")) {
  throw new Error('client identity check failed');
}

await writeFile(outputPath, output, 'utf8');
const info = await stat(outputPath);
const sha = createHash('sha256').update(output, 'utf8').digest('hex');
console.log(`built client.js: ${info.size} bytes`);
console.log(`client.js sha256: ${sha}`);
console.log(`vendor: ${vendorBytes} bytes, ${vendorSha}`);
