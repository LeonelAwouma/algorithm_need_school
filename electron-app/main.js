// Processus principal Electron : sert l'export statique Next.js (dossier
// "out") via un petit serveur HTTP local, puis l'affiche dans une fenêtre.
// Aucune donnée ne quitte la machine : le serveur n'écoute que sur
// 127.0.0.1. Le seul échange réseau est la recherche de mises à jour
// (voir mises-a-jour.js), qui ne transmet aucune donnée d'utilisateur.
// Serveur écrit sans dépendance externe pour garder l'exécutable léger.

const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { app, BrowserWindow, Menu } = require('electron')
const { demarrerMisesAJour } = require('./mises-a-jour')
const { brancherStockage } = require('./stockage')

/** Fenêtre principale courante, pour lui transmettre l'état des mises à jour. */
let fenetrePrincipale = null

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** Dossier contenant l'export statique : à côté de l'exécutable une fois empaqueté, sous electron/.. en développement. */
function resolveStaticDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'out')
    : path.join(__dirname, '..', 'out')
}

/** Sert un fichier du dossier statique ; retombe sur index.html pour toute route inconnue (page unique). */
function requestListener(publicDir) {
  return (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const relative = pathname.endsWith('/') ? pathname + 'index.html' : pathname
    const filePath = path.normalize(path.join(publicDir, relative))

    // Empêche toute évasion du dossier public via "..".
    if (!filePath.startsWith(publicDir)) { res.writeHead(403); res.end(); return }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(publicDir, 'index.html'), (err2, fallback) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(fallback)
        })
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' })
      res.end(data)
    })
  }
}

/** Démarre le serveur de fichiers statiques local et résout avec son port. */
function startStaticServer() {
  const publicDir = resolveStaticDir()
  const server = http.createServer(requestListener(publicDir))
  return new Promise((resolve, reject) => {
    server.on('error', reject)
    // Port 0 : le système choisit un port local libre, pour éviter tout conflit.
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
}

async function createWindow() {
  const port = await startStaticServer()
  console.log(`Serveur local démarré sur http://127.0.0.1:${port}/`)

  // Application installée : l'icône est celle de l'exécutable, posée par
  // electron-builder. Ce fichier n'est utile qu'en `npm run start`, où
  // l'exécutable est celui d'Electron.
  const iconePath = path.join(__dirname, 'build', 'icon.ico')

  const win = new BrowserWindow({
    ...(fs.existsSync(iconePath) ? { icon: iconePath } : {}),
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    title: 'AlgoBaba',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  fenetrePrincipale = win

  await win.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  brancherStockage()
  demarrerMisesAJour(() => fenetrePrincipale)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
