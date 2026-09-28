// Pont entre la fenêtre et le processus principal.
//
// La page n'a aucun accès à Node ni au système de fichiers (contextIsolation,
// nodeIntegration désactivé). Seules ces trois fonctions, liées aux mises à jour,
// lui sont exposées. Dans un navigateur ordinaire, `window.algobaba` n'existe pas
// et l'interface n'affiche simplement rien de ce qui concerne les mises à jour.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('algobaba', {
  misesAJour: {
    /** État courant : phase, version installée, version disponible, progression. */
    etat: () => ipcRenderer.invoke('maj:etat'),
    /** Appelle `rappel` à chaque changement d'état ; renvoie la fonction de désabonnement. */
    surChangement: rappel => {
      const ecouteur = (_evenement, etat) => rappel(etat)
      ipcRenderer.on('maj:etat', ecouteur)
      return () => ipcRenderer.removeListener('maj:etat', ecouteur)
    },
    /** Ferme l'application, installe la version téléchargée et relance. */
    installer: () => ipcRenderer.invoke('maj:installer'),
  },
})
