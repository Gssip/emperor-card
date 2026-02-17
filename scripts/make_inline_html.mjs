/**
 * 后处理脚本：将 webpack 构建的 dist HTML 拆分为：
 * 1. inline.html - CSS + HTML 元素（无 <script>），用于正则替换
 * 2. index.js    - 独立 JS 文件，用于酒馆助手脚本库加载
 * 
 * 用法: node scripts/make_inline_html.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist', '沉沦色欲的皇帝');
const inputFile = path.join(distDir, 'index.html');
const outputHTML = path.join(distDir, 'inline.html');
const outputJS = path.join(distDir, 'index.js');

let html = fs.readFileSync(inputFile, 'utf-8');

// 提取 <script> 内容
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
let jsContent = '';
if (scriptMatch) {
    jsContent = scriptMatch[1].trim();
    // 去掉所有 sourcemap 注释（包括内联 base64 的）
    jsContent = jsContent.replace(/\/\/# sourceMappingURL=[^\n]*/g, '').trim();
}

// 从 HTML 中移除 <script>...</script> 标签
let inlineHTML = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');

// 去掉 <head>, </head>, <body>, </body>, <html>, </html> 标签
inlineHTML = inlineHTML.replace(/<\/?head>/gi, '');
inlineHTML = inlineHTML.replace(/<\/?body>/gi, '');
inlineHTML = inlineHTML.replace(/<\/?html[^>]*>/gi, '');

// 去掉 sourcemap 注释
inlineHTML = inlineHTML.replace(/\/\*# sourceMappingURL=.*?\*\//g, '');
inlineHTML = inlineHTML.replace(/\/\/# sourceMappingURL=.*/g, '');

// 清理多余空行
inlineHTML = inlineHTML.replace(/\n{3,}/g, '\n').trim();

// 写入文件
fs.writeFileSync(outputHTML, inlineHTML, 'utf-8');
fs.writeFileSync(outputJS, jsContent, 'utf-8');

const htmlSizeKB = (Buffer.byteLength(inlineHTML, 'utf-8') / 1024).toFixed(1);
const jsSizeKB = (Buffer.byteLength(jsContent, 'utf-8') / 1024).toFixed(1);

console.log(`✅ 拆分完成:`);
console.log(`   inline.html: ${htmlSizeKB} KB (CSS + HTML, 粘贴到正则替换)`);
console.log(`   index.js:    ${jsSizeKB} KB (JS, 通过酒馆助手脚本加载)`);
