/**
 * Génère les données factices du frontend à partir des moteurs de référence.
 *
 *   pnpm --dir moteur-reference fixtures
 *
 * Le script joue le rôle du futur serveur Django sur le jeu de démonstration :
 * il exécute les moteurs, met chaque réponse au format du contrat de l'API
 * (vérifié à la compilation) et écrit :
 *   - frontend/public/donnees-factices/<famille>.json : catalogue des lectures ;
 *   - frontend/public/donnees-factices/index.json : famille de chaque chemin, pour
 *     que les données factices ne chargent que ce dont l'écran a besoin ;
 *   - frontend/public/donnees-factices/etat-initial.json : objets que les écritures
 *     factices font évoluer en mémoire ;
 *   - frontend/tests/donnees/rapport-demonstration.json : rapport de décision
 *     utilisé par le test de l'export Word.
 *
 * Ces fichiers ne sont pas versionnés, et le build du frontend les retire de
 * l'export : l'application compilée n'en contient aucun.
 *
 * Les mêmes réponses serviront de référence aux tests de parité du backend
 * Python (étape 1 du plan de migration). La génération est déterministe : deux
 * exécutions produisent des fichiers identiques.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'

import type { EtatInitial } from '../../frontend/mocks/format'
import type { DecisionReport } from '../../frontend/components/shared/api/contrat'
import { JEU, SCENARIO_RETENU, construireContexte } from './serveur/contexte'
import { routesDecisions } from './serveur/decisions'
import { routesDiagnostic } from './serveur/diagnostic'
import { routesDonnees } from './serveur/donnees'
import { routesNominations } from './serveur/nominations'
import { Catalogue } from './serveur/outils'
import { routesPlanification } from './serveur/planification'
import { routesSimulation } from './serveur/simulation'

/** Racine du dépôt (le script est compilé dans .build-scripts/moteur-reference/scripts). */
const RACINE = path.resolve(__dirname, '..', '..', '..', '..')
const DOSSIER_MOCKS = path.join(RACINE, 'frontend', 'public', 'donnees-factices')
const DOSSIER_TESTS = path.join(RACINE, 'frontend', 'tests', 'donnees')

function ecrire(fichier: string, contenu: unknown): number {
  mkdirSync(path.dirname(fichier), { recursive: true })
  const texte = JSON.stringify(contenu)
  writeFileSync(fichier, texte + '\n', 'utf8')
  return texte.length
}

function principal(): void {
  const ctx = construireContexte()
  const catalogue = new Catalogue()

  const donnees = routesDonnees(ctx, catalogue)
  routesDiagnostic(ctx, catalogue)
  routesSimulation(ctx, catalogue)
  const decisions = routesDecisions(ctx, catalogue)
  const planification = routesPlanification(ctx, catalogue)
  const nominations = routesNominations(ctx, catalogue, decisions.recruesExemple)

  const etat: EtatInitial = {
    jeu: { ...donnees.jeu, scenarioRetenuId: SCENARIO_RETENU },
    qualite: donnees.qualite,
    validation: donnees.validation,
    actualisations: [],
    fichiers: donnees.fichiers,
    parametres: decisions.parametres,
    faitsPrince: [],
    impactsPrince: decisions.impactsPrince,
    arbitrages: [],
    recrues: [],
    recruesExemple: decisions.recruesExemple,
    recrutesParScenario: decisions.recrutesParScenario,
    hypotheses: planification.hypotheses,
    historiqueHypotheses: planification.historiqueHypotheses,
    quotas: planification.quotas,
    historiqueQuotas: planification.historiqueQuotas,
    versionsPlanification: planification.versionsPlanification,
    etatPlanification: planification.etatPlanification,
    estimationAttrition: planification.estimationAttrition,
    rapprochements: nominations.rapprochements,
    vivier: nominations.vivier,
    postesOuverts: nominations.postesOuverts,
    nominations: nominations.nominations,
    mouvements: nominations.mouvements,
    audit: nominations.audit,
  }

  const bilan: string[] = []
  const index: Record<string, string> = {}
  for (const [famille, contenu] of catalogue.contenu()) {
    const taille = ecrire(path.join(DOSSIER_MOCKS, `${famille}.json`), contenu)
    for (const chemin of Object.keys(contenu)) index[chemin] = famille
    const reponses = Object.values(contenu).reduce((n, entrees) => n + entrees.length, 0)
    bilan.push(`${famille.padEnd(14)} ${String(reponses).padStart(5)} réponses  ${(taille / 1024).toFixed(0)} Ko`)
  }
  ecrire(path.join(DOSSIER_MOCKS, 'index.json'), index)
  const tailleEtat = ecrire(path.join(DOSSIER_MOCKS, 'etat-initial.json'), etat)
  bilan.push(`${'etat-initial'.padEnd(14)} ${''.padStart(5)}            ${(tailleEtat / 1024).toFixed(0)} Ko`)

  const rapport = catalogue
    .contenu()
    .flatMap(([, contenu]) => contenu[`jeux/${JEU}/rapport/`] ?? [])
    .find(e => Object.keys(e.query).length === 0)?.reponse as DecisionReport | undefined
  if (!rapport) throw new Error('Rapport national introuvable dans le catalogue')
  ecrire(path.join(DOSSIER_TESTS, 'rapport-demonstration.json'), rapport)

  console.log(`Données factices générées dans ${path.relative(RACINE, DOSSIER_MOCKS)} :`)
  for (const ligne of bilan) console.log(`  ${ligne}`)
}

principal()
