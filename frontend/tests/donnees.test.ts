/**
 * Reconnaissance des colonnes, compatibilité avec les anciens fichiers,
 * contrôle qualité et agrégations territoriales.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { applyManualMapping, detectColumns } from '../lib/data/column-mapping'
import { recordsFromRows } from '../lib/data/normalize'
import { parseSchools, parseTeachers } from '../lib/data/parse'
import { buildDataQualityReport } from '../lib/validation/data-quality'
import { runDiagnostic } from '../lib/analytics/diagnostic'
import { appliquerFiltres, construireArbreTerritorial, FILTRES_VIDES, trouverNoeud } from '../lib/analytics/territory'
import { syntheseTableauDeBord } from '../lib/analytics/narrative'
import { DEFAULT_SETTINGS } from '../lib/config/settings'
import { construireJeuDemonstration } from '../lib/data/demo-dataset'
import { ecole } from './fixtures'

/** Fichier « ancienne génération » : colonnes historiques, sans effectifs élèves. */
const ANCIEN_FICHIER: unknown[][] = [
  ['id_etab', 'nom_etab', 'commune', 'departement', 'region', 'zone', 'nb_classes', 'nb_enseignants_etat', 'nb_postes_ouverts', 'classes_multigrades', 'priorite_locale', 'type_etab'],
  ['E001', 'EP Mvog-Betsi', 'Yaoundé VII', 'Mfoundi', 'Centre', 'urbaine', 8, 5, 3, 0, 1, 'EP'],
  ['E002', 'EP Obala Centre', 'Obala', 'Lekié', 'Centre', 'rurale', 6, 9, 0, 2, 0, 'EP'],
]

/** Fichier « nouvelle génération » : en-têtes libres, avec effectifs élèves. */
const NOUVEAU_FICHIER: unknown[][] = [
  ['Code établissement', 'Nom de l’école', 'Commune', 'Département', 'Région', 'Milieu', 'Nombre de classes', 'Enseignants État', 'TOTAL_ELEVES', 'Total filles', 'CI', 'CP'],
  ['E010', 'EP Douala Nord', 'Douala III', 'Wouri', 'Littoral', 'urbaine', 10, 7, 620, 300, 110, 105],
]

test('Les anciens fichiers restent reconnus colonne par colonne', () => {
  const { headers } = recordsFromRows(ANCIEN_FICHIER)
  const mapping = detectColumns('etablissements', headers)
  assert.equal(mapping.incomplet, false)
  const parChamp = new Map(mapping.matches.map(m => [m.champ, m]))
  assert.equal(parChamp.get('id')?.enTete, 'id_etab')
  assert.equal(parChamp.get('nbEnseignantsEtat')?.enTete, 'nb_enseignants_etat')
  assert.equal(parChamp.get('nbPostesOuvertsDeclares')?.enTete, 'nb_postes_ouverts')
  assert.equal(parChamp.get('effectifTotalEleves')?.enTete, null)
})

test('Les en-têtes libres sont rapprochés par le dictionnaire local', () => {
  const { headers } = recordsFromRows(NOUVEAU_FICHIER)
  const mapping = detectColumns('etablissements', headers)
  const parChamp = new Map(mapping.matches.map(m => [m.champ, m]))
  assert.equal(parChamp.get('id')?.enTete, 'Code établissement')
  assert.equal(parChamp.get('commune')?.enTete, 'Commune')
  assert.equal(parChamp.get('zone')?.enTete, 'Milieu')
  assert.equal(parChamp.get('effectifTotalEleves')?.enTete, 'TOTAL_ELEVES')
  assert.equal(parChamp.get('effectifCI')?.enTete, 'CI')
  assert.equal(mapping.incomplet, false)
})

test('Un ancien fichier sans colonnes élèves reste entièrement calculable', () => {
  const { headers, records } = recordsFromRows(ANCIEN_FICHIER)
  const schools = parseSchools(records, detectColumns('etablissements', headers))
  assert.equal(schools.length, 2)
  assert.equal(schools[0].effectifTotalEleves, null)
  assert.equal(schools[0].nbPostesOuvertsDeclares, 3)

  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
  assert.equal(diagnostic.totals.postesNecessaires, 3)
  assert.equal(diagnostic.totals.excedentMobilisable, 3)
  assert.equal(diagnostic.donneesElevesDisponibles, false)
})

test('Les effectifs fournis alimentent les indicateurs pédagogiques', () => {
  const { headers, records } = recordsFromRows(NOUVEAU_FICHIER)
  const schools = parseSchools(records, detectColumns('etablissements', headers))
  assert.equal(schools[0].effectifTotalEleves, 620)
  assert.equal(schools[0].effectifParNiveau.CI, 110)

  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
  assert.equal(diagnostic.donneesElevesDisponibles, true)
  assert.equal(diagnostic.schools[0].elevesParClasse, 62)
})

test('La correspondance manuelle remplace la détection automatique', () => {
  const { headers } = recordsFromRows(NOUVEAU_FICHIER)
  let mapping = detectColumns('etablissements', headers)
  mapping = applyManualMapping(mapping, 'effectifGarcons', 'Total filles')
  const parChamp = new Map(mapping.matches.map(m => [m.champ, m]))
  assert.equal(parChamp.get('effectifGarcons')?.enTete, 'Total filles')
  assert.equal(parChamp.get('effectifGarcons')?.methode, 'manuel')
  assert.equal(parChamp.get('effectifFilles')?.enTete, null, "un en-tête ne peut servir qu'une fois")
})

test('Le contrôle qualité signale les enseignants rattachés à une école inconnue', () => {
  const { headers: hE, records: rE } = recordsFromRows(ANCIEN_FICHIER)
  const mappingEcoles = detectColumns('etablissements', hE)
  const schools = parseSchools(rE, mappingEcoles)

  const fichierEns: unknown[][] = [
    ['id_ens', 'nom', 'prenom', 'id_etab_attache', 'anciennete_carriere_ans', 'statut'],
    ['T1', 'Abena', 'Alice', 'E001', 12, 'actif'],
    ['T2', 'Bello', 'Bernard', 'E999', 8, 'actif'],
    ['T2', 'Bello', 'Bernard', 'E001', 8, 'actif'],
    ['', 'Sans', 'Matricule', 'E001', 3, 'actif'],
  ]
  const { headers: hT, records: rT } = recordsFromRows(fichierEns)
  const mappingEns = detectColumns('enseignants', hT)
  const teachers = parseTeachers(rT, mappingEns, schools)

  const rapport = buildDataQualityReport({
    schools,
    teachers,
    schoolMapping: mappingEcoles,
    teacherMapping: mappingEns,
    lignesEtablissements: rE.length,
    lignesEnseignants: rT.length,
  })

  assert.equal(rapport.unknownSchools.length, 1)
  assert.equal(rapport.unknownSchools[0].schoolId, 'E999')
  assert.equal(rapport.duplicates.filter(d => d.dataset === 'enseignants').length, 1)
  assert.ok(rapport.errors.some(e => e.code === 'ens_sans_id'))
  assert.equal(rapport.donneesElevesDisponibles, false)
  assert.ok(rapport.score < 100, 'le score retire des points pour chaque problème détecté')
  assert.ok(rapport.detailScore.length > 0, 'le score est explicable ligne par ligne')
})

test("Le score de qualité atteint 100 sur un jeu de données sans défaut", () => {
  const demo = construireJeuDemonstration()
  const { headers: hE } = recordsFromRows([['id_etab']])
  void hE
  const mappingEcoles = detectColumns('etablissements', [
    'id_etab', 'nom_etab', 'region', 'departement', 'commune', 'zone', 'type_etab',
    'nb_classes', 'nb_salles_classe', 'nb_enseignants_etat', 'nb_autres_enseignants',
    'nb_postes_ouverts', 'classes_multigrades', 'priorite_locale',
    'effectif_total_eleves', 'effectif_filles', 'effectif_garcons',
    'effectif_ci', 'effectif_cp', 'effectif_ce1', 'effectif_ce2', 'effectif_cm1', 'effectif_cm2',
  ])
  const mappingEns = detectColumns('enseignants', [
    'id_ens', 'nom', 'prenom', 'date_naissance', 'id_etab_attache',
    'commune_attache', 'departement_attache', 'region_attache', 'zone_attache',
    'anciennete_carriere_ans', 'anciennete_poste_ans', 'situation_familiale',
    'nb_enfants', 'formation_continue', 'statut', 'paye_par_etat',
  ])

  const rapport = buildDataQualityReport({
    schools: demo.schools,
    teachers: demo.teachers,
    schoolMapping: mappingEcoles,
    teacherMapping: mappingEns,
    lignesEtablissements: demo.schools.length,
    lignesEnseignants: demo.teachers.length,
  })

  assert.equal(rapport.territorialCompleteness.tauxComplet, 1)
  assert.equal(rapport.unknownSchools.length, 0)
  assert.equal(rapport.duplicates.length, 0)
  assert.equal(rapport.donneesElevesDisponibles, true)
})

test("L'arbre territorial agrège correctement les quatre niveaux", () => {
  const schools = [
    ecole({ id: 'A', region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé I', nbClasses: 6, nbEnseignantsEtat: 4 }),
    ecole({ id: 'B', region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé VII', nbClasses: 6, nbEnseignantsEtat: 9 }),
    ecole({ id: 'C', region: 'Centre', departement: 'Lekié', commune: 'Obala', nbClasses: 4, nbEnseignantsEtat: 2 }),
    ecole({ id: 'D', region: 'Littoral', departement: 'Wouri', commune: 'Douala III', nbClasses: 10, nbEnseignantsEtat: 10 }),
  ]
  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
  const arbre = construireArbreTerritorial(diagnostic.schools)

  assert.equal(arbre.totals.ecolesAnalysees, 4)
  assert.equal(arbre.totals.postesNecessaires, 4)
  assert.equal(arbre.totals.excedentMobilisable, 3)
  assert.equal(arbre.children.length, 2)

  const centre = trouverNoeud(arbre, { region: 'Centre', departement: null, commune: null })
  assert.equal(centre?.totals.ecolesAnalysees, 3)
  assert.equal(centre?.totals.postesNecessaires, 4)

  const mfoundi = trouverNoeud(arbre, { region: 'Centre', departement: 'Mfoundi', commune: null })
  assert.equal(mfoundi?.totals.ecolesAnalysees, 2)
  assert.equal(mfoundi?.totals.postesNecessaires, 2)
  assert.equal(mfoundi?.totals.excedentMobilisable, 3)

  const obala = trouverNoeud(arbre, { region: 'Centre', departement: 'Lekié', commune: 'Obala' })
  assert.equal(obala?.totals.ecolesAnalysees, 1)
  assert.equal(obala?.totals.postesNecessaires, 2)
})

test('Les filtres globaux restreignent bien le périmètre analysé', () => {
  const schools = [
    ecole({ id: 'A', region: 'Centre', zone: 'urbaine', nbClasses: 6, nbEnseignantsEtat: 4 }),
    ecole({ id: 'B', region: 'Littoral', zone: 'rurale', nbClasses: 6, nbEnseignantsEtat: 4, classesMultigrades: 2 }),
  ]
  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)

  const parRegion = appliquerFiltres(diagnostic.schools, { ...FILTRES_VIDES, territoire: { region: 'Centre', departement: null, commune: null } })
  assert.deepEqual(parRegion.map(d => d.school.id), ['A'])

  const parZone = appliquerFiltres(diagnostic.schools, { ...FILTRES_VIDES, zones: ['rurale'] })
  assert.deepEqual(parZone.map(d => d.school.id), ['B'])

  const parMultigrade = appliquerFiltres(diagnostic.schools, { ...FILTRES_VIDES, multigradesUniquement: true })
  assert.deepEqual(parMultigrade.map(d => d.school.id), ['B'])
})

test('La synthèse textuelle décrit les résultats sans formuler de recommandation', () => {
  const schools = [
    ecole({ id: 'A', nbClasses: 6, nbEnseignantsEtat: 4 }),
    ecole({ id: 'B', nbClasses: 6, nbEnseignantsEtat: 9 }),
  ]
  const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
  const enonces = syntheseTableauDeBord(diagnostic.totals, null, 'Cameroun')
  const texte = enonces.map(e => e.texte).join(' ')

  assert.ok(texte.includes('50 %'))
  assert.ok(texte.includes('2 postes nécessaires') || texte.includes('2 poste'))
  assert.ok(texte.includes('3 enseignants'))
  for (const interdit of ['meilleur scénario', 'il faut', 'nous recommandons', 'doit être']) {
    assert.ok(!texte.toLowerCase().includes(interdit), `la synthèse ne doit pas contenir « ${interdit} »`)
  }
})

test('Le jeu de démonstration est déterministe et complet', () => {
  const a = construireJeuDemonstration()
  const b = construireJeuDemonstration()
  assert.equal(a.schools.length, b.schools.length)
  assert.deepEqual(a.schools.map(s => s.nbEnseignantsEtat), b.schools.map(s => s.nbEnseignantsEtat))
  assert.equal(a.demonstration, true)
  assert.ok(a.schools.length >= 40)
  assert.ok(a.teachers.every(t => a.schools.some(s => s.id === t.idEtabAttache)))
})
