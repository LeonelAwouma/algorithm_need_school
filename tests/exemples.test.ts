/**
 * Les jeux d'essai livrés dans data/exemples, au format officiel MINEDUB, passent
 * toute la chaîne : lecture, reconnaissance des colonnes, sections bilingues,
 * zones de sécurité, demandes de mutation, plan complet et nouveaux recrutés.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as path from 'node:path'
import * as XLSX from 'xlsx'

import { runDiagnostic } from '../lib/analytics/diagnostic'
import { DEFAULT_SETTINGS, cloneSettings } from '../lib/config/settings'
import { detectColumns, type DatasetKind } from '../lib/data/column-mapping'
import { construireDataset, type FichierLu } from '../lib/data/import'
import { recordsFromRows } from '../lib/data/normalize'
import { analyserRecrues } from '../lib/data/recrues'
import { runSimulation } from '../lib/simulation/engine'
import { tousInvariantsOk } from '../lib/simulation/invariants'
import { scenarioGeographique } from '../lib/simulation/scenarios'

const DOSSIER = path.resolve(__dirname, '..', '..', 'data', 'exemples')

function lignes(fichier: string): unknown[][] {
  const wb = XLSX.readFile(path.join(DOSSIER, fichier))
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true }) as unknown[][]
}

function fichierLu(kind: DatasetKind, fichier: string): FichierLu {
  const { headers, records } = recordsFromRows(lignes(fichier))
  return { kind, nomFichier: fichier, feuilles: [], feuilleLue: '', headers, records, mapping: detectColumns(kind, headers) }
}

const etablissements = fichierLu('etablissements', 'format-minedub-etablissements.xlsx')
const enseignants = fichierLu('enseignants', 'format-minedub-enseignants.xlsx')
const { dataset } = construireDataset(etablissements, enseignants, new Date(Date.UTC(2026, 6, 1)))

function settings2026() {
  const settings = cloneSettings(DEFAULT_SETTINGS)
  settings.anneeScolaire = '2026-2027'
  return settings
}

test('Le jeu d’essai MINEDUB s’importe sans correction : toutes ses colonnes sont reconnues', () => {
  assert.equal(etablissements.mapping.incomplet, false)
  assert.equal(enseignants.mapping.incomplet, false)
  assert.deepEqual(etablissements.mapping.enTetesInconnus, [], 'toutes les colonnes établissements sont reconnues')
  assert.deepEqual(enseignants.mapping.enTetesInconnus, [], 'toutes les colonnes enseignants sont reconnues')
  assert.equal(etablissements.mapping.matches.find(m => m.champ === 'nbPostesOuvertsDeclares')?.enTete, 'nb_postes_ouverts')

  const reconnus = (f: FichierLu) => new Set(f.mapping.matches.filter(m => m.enTete).map(m => m.champ))
  for (const champ of ['sousSysteme', 'iaeb', 'sallesSimpleFlux', 'sallesDoubleFlux', 'zoneSecurite', 'accessibilite', 'effectifTotalEleves', 'classesMultigrades']) {
    assert.ok(reconnus(etablissements).has(champ), `établissements : ${champ}`)
  }
  for (const champ of ['age', 'sousSystemeEns', 'voeu1', 'voeu2', 'voeu3', 'motifDemande', 'anneesZoneNiveau1', 'anneesZoneNiveau2']) {
    assert.ok(reconnus(enseignants).has(champ), `enseignants : ${champ}`)
  }
})

test('Écoles bilingues, accessibilité, zones de sécurité et vœux sont lus comme le prévoit le référentiel', () => {
  assert.equal(dataset.schools.filter(s => s.id.endsWith('-EN')).length, 6)
  assert.equal(dataset.schools.filter(s => s.id.endsWith('-FR')).length, 6)
  assert.ok(dataset.schools.some(s => s.accessibilite === 'rural_enclave'))
  assert.ok(dataset.schools.every(s => s.iaeb !== ''), 'circonscription IAEB lue')
  assert.ok(dataset.schools.every(s => s.nbPostesOuvertsDeclares != null), 'postes déclarés lus pour chaque école')
  assert.ok(dataset.teachers.every(x => x.age != null), 'âge lu dans la colonne Age')
  assert.ok(dataset.teachers.filter(t => t.voeux.length > 0).length > 500)
  assert.ok(dataset.teachers.filter(t => t.idEtabAttache.endsWith('-EN')).every(t => t.sousSysteme === 'anglophone'))

  // Les trois zones de sécurité sont présentes et pèsent dans la priorité des écoles.
  for (const zone of ['verte', 'jaune', 'rouge'] as const) {
    assert.ok(dataset.schools.filter(s => s.zoneSecurite === zone).length > 50, `zone ${zone}`)
  }
  const diagnostic = runDiagnostic(dataset.schools, settings2026(), dataset.teachers)
  const points = DEFAULT_SETTINGS.priorite.pointsSecurite
  for (const d of diagnostic.schools) {
    assert.equal(d.priorite.zoneSecurite, d.school.zoneSecurite)
    assert.equal(d.priorite.pointsSecurite, points[d.school.zoneSecurite ?? 'verte'], `points de sécurité de ${d.school.id}`)
    assert.equal(d.priorite.zoneRouge, d.school.zoneSecurite === 'rouge')
  }
})

/**
 * Candidats au concours construits à partir du jeu d'essai : chacun demande trois
 * écoles en déficit de son sous-système. Le jeu MINEDUB ne comporte pas de fichier
 * de recrutés ; ces lignes ont la forme du fichier importé dans « Nouveaux recrutés ».
 */
function lignesRecrues(ecolesEnDeficit: { id: string; commune: string; sousSysteme: string }[]): unknown[][] {
  const lignes: unknown[][] = [['matricule', 'nom', 'note', 'sous_systeme', 'sexe', 'commune_residence', 'choix_1', 'choix_2', 'choix_3']]
  for (let i = 0; i < 60; i++) {
    const ecole = ecolesEnDeficit[i % ecolesEnDeficit.length]
    const memes = ecolesEnDeficit.filter(e => e.sousSysteme === ecole.sousSysteme)
    const choix = [0, 1, 2].map(k => memes[(i + k * 7) % memes.length].id)
    lignes.push([`REC-${String(i + 1).padStart(3, '0')}`, `Candidat ${i + 1}`, 12 + (i % 8), ecole.sousSysteme, i % 2 ? 'F' : 'M', ecole.commune, ...choix])
  }
  return lignes
}

test('Le plan complet se calcule sur le jeu d’essai MINEDUB et respecte tous les contrôles', () => {
  const settings = settings2026()
  const diagnostic = runDiagnostic(dataset.schools, settings, dataset.teachers)
  const ecarts = diagnostic.schools.filter(d => d.ecartBesoinDeclare !== 0)
  assert.equal(ecarts.length, 0, `postes déclarés = besoin calculé pour chaque école (écarts : ${ecarts.slice(0, 3).map(d => d.school.id).join(', ')})`)

  const enDeficit = diagnostic.schools
    .filter(d => d.besoinTheorique > 0 && d.school.sousSysteme)
    .map(d => ({ id: d.school.id, commune: d.school.commune, sousSysteme: d.school.sousSysteme === 'anglophone' ? 'Anglophone' : 'Francophone' }))
  const recrues = analyserRecrues(lignesRecrues(enDeficit))
  assert.equal(recrues.manquantes.length, 0)
  assert.equal(recrues.recrues.length, 60)

  for (const scope of ['departement', 'etendu'] as const) {
    const r = runSimulation({
      diagnostics: diagnostic.schools,
      schools: dataset.schools,
      teachers: dataset.teachers,
      scenario: scenarioGeographique(scope, settings),
      recrues: recrues.recrues,
    })
    assert.ok(tousInvariantsOk(r.invariants), JSON.stringify(r.invariants.filter(i => !i.ok)))
    assert.ok(r.mouvementsParNature.some(m => m.nature === 'voeu' && m.nombre > 0), 'des vœux sont satisfaits')
    assert.ok(r.candidatures.some(c => !c.recevable), 'des demandes sont irrecevables')
    assert.ok((r.recrutes?.affectations.length ?? 0) > 0, 'des recrutés sont affectés')
    assert.ok(r.assignments.some(a => a.niveauProximite === 'meme_iaeb' || a.niveauProximite === 'meme_commune'))
    assert.equal(r.postesCouverts + r.besoinResiduel, r.besoinInitial)

    // Règle de la zone rouge : aucun mouvement imposé ni hors vœux vers une école en zone rouge.
    const zoneDe = new Map(r.postes.map(p => [p.id, p.priorite.zoneSecurite]))
    const versRouge = r.assignments.filter(a => zoneDe.get(a.postId) === 'rouge')
    assert.ok(versRouge.every(a => a.nature === 'voeu' || a.nature === 'arbitrage'), JSON.stringify(versRouge.filter(a => a.nature !== 'voeu').slice(0, 2)))
  }
})
