#!/bin/bash
const { exec, cd } = require('shelljs')
const { resolve } = require('path')
const fs = require('fs')
const p = resolve(__dirname, '../vite')
cd(p)

exec('npm run build')

// 生成生产环境 index.html
const pkg = JSON.parse(fs.readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
const v = pkg.version
const html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\'UTF-8\'>\n<meta http-equiv=\'x-ua-compatible\' content=\'IE=edge\'>\n<meta name=\'viewport\' content=\'width=device-width, initial-scale=1, shrink-to-fit=no\'>\n<title>XNOW</title>\n<link rel=\'stylesheet\' href=\'css/style-' + v + '.css\'>\n<style id=\'theme-css\'></style>\n<style id=\'custom-css\'></style>\n<style>\n  body { background: #0a0e1a; }\n  #content-loading {\n    position: fixed; left: 0; top: 0; width: 100%; height: 100%;\n    display: flex; flex-direction: column; justify-content: center; align-items: center;\n  }\n  .morph-shape {\n    background: linear-gradient(135deg, #00f5ff 0%, #0080ff 50%, #7b2ff7 100%);\n    animation: morph 8s ease-in-out infinite;\n    border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;\n    box-shadow: 0 0 40px rgba(0, 245, 255, 0.6), 0 0 80px rgba(123, 47, 247, 0.4);\n  }\n</style>\n</head>\n<body>\n<div id=\'container\'></div>\n<div id=\'content-loading\'>\n  <div class=\'morph-shape iblock pd3\'>\n    <img class=\'iblock logo-filter\' src=\'images/xnow-logo.png\' alt=\'XNOW\' height=80>\n  </div>\n</div>\n<script>window.et = {\"version\":\"' + v + '\",\"isDev\":false,\"siteName\":\"XNOW\"}</script>\n<script src=\'/js/basic-' + v + '.js\' type=\'module\'></script>\n<script src=\'/js/electerm-' + v + '.js\' type=\'module\'></script>\n</body>\n</html>'
fs.writeFileSync(resolve(__dirname, '../../work/app/assets/index.html'), html)
console.log('index.html generated for production (v' + v + ')')
