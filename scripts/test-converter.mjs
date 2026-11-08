import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OpenCC = require('../vendor/opencc.cn2t.umd.cjs');

assert.equal(typeof OpenCC.Converter, 'function', 'opencc-js exposes Converter');
const convert = OpenCC.Converter({ from: 'cn', to: 'hk' });

const cases = [
  ['新建会话', '新建會話'],
  ['自动化任务', '自動化任務'],
  ['上下文洞察', '上下文洞察'],
  ['任务看板', '任務看板'],
  ['智能体', '智能體'],
  ['工作区', '工作區'],
  ['进行中', '進行中'],
  ['已归档', '已歸檔'],
  ['收起侧边栏', '收起側邊欄'],
  ['DeepSeek 账号', 'DeepSeek 賬號'],
  ['非对称模型结构，小成本大智能。', '非對稱模型結構，小成本大智能。'],
  ['气泡全局开关', '氣泡全局開關'],
  ['避让滚动条', '避讓滾動條'],
  ['推理等级', '推理等級'],
  ['设置', '設置'],
  ['退出登录', '退出登錄'],
  ['链接', '鏈接'],
  ['里面为什么', '裏面為什麼'],
  ['软件和信息', '軟件和信息'],
  ['已经繁體', '已經繁體'],
  ['插件', '插件']
];

let passed = 0;
for (const [input, expected] of cases) {
  const actual = convert(input);
  assert.equal(actual, expected, `${input} -> ${actual}, expected ${expected}`);
  assert.equal(convert(actual), actual, `not idempotent for ${input}`);
  passed += 1;
}

const ascii = 'DeepSeek V3.2 123 !@#$%^&*()_+-=[]{};:,.<>/?\\|`~ 😀';
assert.equal(convert(ascii), ascii, 'ASCII, numbers, punctuation, and emoji must pass through');
assert.equal(convert(''), '', 'empty string');

const started = process.hrtime.bigint();
const sample = '上下文洞察与任务看板，工作区中的自动化任务。'.repeat(50);
for (let i = 0; i < 1000; i += 1) convert(sample);
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
console.log(`converter cases passed: ${passed}`);
console.log(`1000 conversions of ${sample.length} chars: ${elapsedMs.toFixed(1)} ms`);
