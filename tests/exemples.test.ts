/**
 * Les jeux d'essai livrés dans data/exemples passent toute la chaîne : lecture,
 * reconnaissance des colonnes du référentiel, sections bilingues, structures
 * d'accueil, demandes de mutation, plan complet et nouveaux recrutés.
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

const etablissements = fichierLu('etablissements', 'jeu-test-etablissements.xlsx')
const enseignants = fichierLu('enseignants', 'jeu-test-enseignants.xlsx')
const { dataset } = construireDataset(etablissements, enseignants, new Date(Date.UTC(2026, 8, 1)))

test('Toutes les colonnes du référentiel sont reconnues dans les jeux d’essai', () => {
  const reconnus = (f: FichierLu) => new Set(f.mapping.matches.filter(m => m.enTete).map(m => m.champ))
  for (const champ of ['sousSysteme', 'sallesDoubleFlux', 'niveauxOuverts', 'zoneSecurite', 'accessibilite', 'nbSallesClasse', 'effectifTotalEleves']) {
    assert.ok(reconnus(etablissements).has(champ), `établissements : ${champ}`)
  }
  for (const champ of ['sousSystemeEns', 'voeu1', 'voeu2', 'voeu3', 'motifDemande', 'ecoleMotif', 'anneesZoneNiveau1', 'anneesZoneNiveau2', 'rangTirage']) {
    assert.ok(reconnus(enseignants).has(champ), `enseignants : ${champ}`)
  }
})

test('Écoles bilingues, structures et vœux sont lus comme le prévoit le référentiel', () => {
  assert.equal(dataset.schools.filter(s => s.id.endsWith('-EN')).length, 6)
  assert.equal(dataset.schools.filter(s => s.id.endsWith('-FR')).length, 6)
  assert.ok(dataset.schools.filter(s => s.estStructure).length > 50)
  assert.ok(dataset.schools.some(s => s.accessibilite === 'rural_enclave'))
  assert.ok(dataset.schools.some(s => s.zoneSecurite === 'rouge'))
  assert.ok(dataset.teachers.filter(t => t.voeux.length > 0).length > 500)
  assert.ok(dataset.teachers.filter(t => t.idEtabAttache.endsWith('-EN')).every(t => t.sousSysteme === 'anglophone'))
})

test('Le plan complet se calcule sur les jeux d’essai et respecte tous les contrôles', () => {
  const settings = cloneSettings(DEFAULT_SETTINGS)
  settings.anneeScolaire = '2026-2027'
  const diagnostic = runDiagnostic(dataset.schools, settings, dataset.teachers)
  assert.ok(diagnostic.schools.every(d => d.ecartBesoinDeclare === 0), 'nb_postes_ouverts correspond au besoin des écoles nécessiteuses')
  const recrues = analyserRecrues(lignes('jeu-test-nouveaux-recrutes.xlsx'))
  assert.equal(recrues.manquantes.length, 0)
  assert.equal(recrues.recrues.length, 180)

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
    assert.equal(r.postesCouverts + r.besoinResiduel, r.besoinInitial)
  }
})

test('Le jeu d’essai au format officiel MINEDUB s’importe sans correction et donne un plan conforme', () => {
  const e = fichierLu('etablissements', 'format-minedub-etablissements.xlsx')
  const t = fichierLu('enseignants', 'format-minedub-enseignants.xlsx')
  assert.equal(e.mapping.incomplet, false)
  assert.equal(t.mapping.incomplet, false)
  assert.deepEqual(e.mapping.enTetesInconnus, [], 'toutes les colonnes établissements sont reconnues')
  assert.equal(e.mapping.matches.find(m => m.champ === 'nbPostesOuvertsDeclares')?.enTete, 'nb_postes_ouverts')
  assert.deepEqual(t.mapping.enTetesInconnus, [], 'toutes les colonnes enseignants sont reconnues')

  const { dataset: minedub } = construireDataset(e, t, new Date(Date.UTC(2026, 6, 1)))
  assert.ok(minedub.schools.every(s => s.iaeb !== ''), 'circonscription IAEB lue')
  assert.ok(minedub.teachers.every(x => x.age != null), 'âge lu dans la colonne Age')
  assert.ok(minedub.schools.every(s => s.nbPostesOuvertsDeclares != null), 'postes déclarés lus pour chaque école')

  const settings = cloneSettings(DEFAULT_SETTINGS)
  settings.anneeScolaire = '2026-2027'
  const diagnostic = runDiagnostic(minedub.schools, settings, minedub.teachers)
  const ecarts = diagnostic.schools.filter(d => d.ecartBesoinDeclare !== 0)
  assert.equal(ecarts.length, 0, `postes déclarés = besoin calculé pour chaque école (écarts : ${ecarts.slice(0, 3).map(d => d.school.id).join(', ')})`)
  const r = runSimulation({ diagnostics: diagnostic.schools, schools: minedub.schools, teachers: minedub.teachers, scenario: scenarioGeographique('departement', settings) })
  assert.ok(tousInvariantsOk(r.invariants), JSON.stringify(r.invariants.filter(i => !i.ok)))
  assert.ok(r.mouvementsParNature.some(m => m.nature === 'voeu' && m.nombre > 0))
  assert.ok(r.assignments.some(a => a.niveauProximite === 'meme_iaeb' || a.niveauProximite === 'meme_commune'))
})
