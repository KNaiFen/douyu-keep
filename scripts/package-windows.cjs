const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const archiver = require('archiver')

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64 with Node.js 24')
  const root = path.resolve(__dirname, '..')
  const stage = path.join(root, 'release/windows-x64')
  const metadata = require('../package.json')
  fs.rmSync(stage, { recursive: true, force: true })
  fs.mkdirSync(path.join(stage, 'runtime'), { recursive: true })
  fs.mkdirSync(path.join(stage, 'app'), { recursive: true })
  fs.copyFileSync(process.execPath, path.join(stage, 'runtime/node.exe'))
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'))
  fs.cpSync(path.join(root, 'build/docker'), path.join(stage, 'app/build/docker'), { recursive: true })
  for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, file), path.join(stage, 'app', file))
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  execFileSync(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.join(stage, 'app'), stdio: 'inherit', windowsHide: true })
  const png = fs.readFileSync(path.join(root, 'packaging/fnos/ICON_256.PNG'))
  const header = Buffer.alloc(22)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  const icon = path.join(root, 'build/launcher.ico')
  fs.writeFileSync(icon, Buffer.concat([header, png]))
  const compiler = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe')
  execFileSync(compiler, ['/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/utf8output', `/win32icon:${icon}`, `/out:${path.join(stage, 'douyu-keep.exe')}`, '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll', path.join(root, 'packaging/windows/Launcher.cs')], { stdio: 'inherit', windowsHide: true })
  const basename = `douyu-keep-${metadata.version}-windows-x64`
  const archive = archiver('zip', { zlib: { level: 9 } })
  const output = fs.createWriteStream(path.join(root, 'release', `${basename}.zip`))
  const zipped = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); archive.on('error', reject) })
  archive.pipe(output)
  archive.directory(stage, false)
  await archive.finalize()
  await zipped
  if (!process.argv.includes('--portable-only')) {
    const nsis = process.env.MAKENSIS_PATH || 'C:/Program Files (x86)/NSIS/makensis.exe'
    execFileSync(nsis, [`/DAPP_DIR=${stage}`, `/DAPP_ICON=${icon}`, `/DAPP_VERSION=${metadata.version}`, `/DOUTPUT_FILE=${path.join(root, 'release', `${basename}.exe`)}`, path.join(root, 'packaging/windows/installer.nsi')], { stdio: 'inherit', windowsHide: true })
  }
  console.log(`Windows browser build ready: ${stage}`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
