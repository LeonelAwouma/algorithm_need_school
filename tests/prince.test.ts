/**
 * Fait de Prince : redéploiement décidé par la DRH, hors algorithme, puis pris
 * en compte par l'algorithme dans tous ses calculs.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { runDiagnostic } from '../lib/analytics/diagnostic'
import { DEFAULT_SETTINGS } from '../lib/config/settings'
import { runSimulation } from '../lib/simulation/engine'
import { tousInvariantsOk } from '../lib/simulation/invariants'
import { scenarioGeographique } from '../lib/simulation/scenarios'
import { appliquerFaitsPrince, nouveauFaitPrince, simulerImpactPrince, verifierFaitPrince } from '../lib/simulation/prince'
import { construireRapport } from '../lib/reporting/report'
import { construireArbreTerritorial } from '../lib/analytics/territory'
import type { Dataset } from '../types/simulation'
import type { FaitPrince } from '../types/prince'
import { ecole, enseignant, enseignantsDe } from './fixtures'

/**
 * A : 4 classes, 6 enseignants (excédent de 2).
 * B : 6 classes, 3 enseignants (déficit de 3), même commune que A.
 * C : 5 classes, 5 enseignants (à l'équilibre), autre département.
 */
function jeu(): Dataset {
  const schools = [
    ecole({ id: 'A', nom: 'EP A', nbClasses: 4, nbEnseignantsEtat: 6 }),
    ecole({ id: 'B', nom: 'EP B', nbClasses: 6, nbEnseignantsEtat: 3, nbPostesOuvertsDeclares: 3 }),
    ecole({ id: 'C', nom: 'EP C', nbClasses: 5, nbEnseignantsEtat: 5, region: 'Est', departement: 'Kadey', commune: 'Batouri' }),
  ]
  const teachers = [
    ...enseignantsDe('A', 6),
    ...enseignantsDe('B', 3),
    ...enseignantsDe('C', 5, { regionAttache: 'Est', departementAttache: 'Kadey', communeAttache: 'Batouri' }),
  ]
  return { schools, teachers, demonstration: false, importedAt: '2026-09-21T00:00:00.000Z', sourceFiles: { etablissements: null, enseignants: null } }
}

function decision(donnees: Dataset, teacherId: string, destinationId: string, reference = ''): FaitPrince {
  const t = donnees.teachers.find(x => x.id === teacherId)!
  const origine = donnees.schools.find(s => s.id === t.idEtabAttache) ?? null
  const destination = donnees.schools.find(s => s.id === destinationId)!
  return nouveauFaitPrince(t, origine, destination, reference, new Date(Date.UTC(2026, 8, 21)))
}

// --- Application aux données -------------------------------------------------

test('Un fait de Prince rattache l’enseignant à sa nouvelle école et met à jour les effectifs', () => {
  const donnees = jeu()
  const { dataset, appliques } = appliquerFaitsPrince(donnees, [decision(donnees, 'A-T1', 'B')])

  assert.equal(appliques.length, 1)
  assert.equal(appliques[0].statut, 'applique')

  const t = dataset.teachers.find(x => x.id === 'A-T1')!
  assert.equal(t.idEtabAttache, 'B')
  assert.equal(t.faitPrinceId, appliques[0].fait.id)
  assert.equal(dataset.schools.find(s => s.id === 'A')!.nbEnseignantsEtat, 5)
  assert.equal(dataset.schools.find(s => s.id === 'B')!.nbEnseignantsEtat, 4)
  assert.equal(dataset.schools.find(s => s.id === 'B')!.nbPostesOuvertsDeclares, 2, 'un poste déclaré de moins à pourvoir')
})

test('Les données importées ne sont jamais modifiées', () => {
  const donnees = jeu()
  const avant = JSON.stringify(donnees)
  appliquerFaitsPrince(donnees, [decision(donnees, 'A-T1', 'B')])
  assert.equal(JSON.stringify(donnees), avant)
})

test('Sans décision, le jeu de données est rendu tel quel', () => {
  const donnees = jeu()
  const sortie = appliquerFaitsPrince(donnees, [])
  assert.equal(sortie.dataset, donnees)
  assert.deepEqual(sortie.appliques, [])
})

test('Un enseignant non payé par l’État ne modifie pas les effectifs comptabilisés', () => {
  const donnees = jeu()
  donnees.teachers = donnees.teachers.map(t => (t.id === 'A-T1' ? { ...t, payeParEtat: false } : t))
  const { dataset } = appliquerFaitsPrince(donnees, [decision(donnees, 'A-T1', 'B')])
  assert.equal(dataset.teachers.find(x => x.id === 'A-T1')!.idEtabAttache, 'B')
  assert.equal(dataset.schools.find(s => s.id === 'A')!.nbEnseignantsEtat, 6)
  assert.equal(dataset.schools.find(s => s.id === 'B')!.nbEnseignantsEtat, 3)
})

test('Les décisions impossibles sont conservées sans effet, avec leur motif', () => {
  const donnees = jeu()
  const inconnu = { ...decision(donnees, 'A-T1', 'B'), id: 'x1', teacherId: 'INCONNU' }
  const ecoleInconnue = { ...decision(donnees, 'A-T2', 'B'), id: 'x2', schoolDestinationId: 'ZZZ' }
  const memeEcole = { ...decision(donnees, 'A-T3', 'B'), id: 'x3', schoolDestinationId: 'A' }
  const { dataset, appliques } = appliquerFaitsPrince(donnees, [inconnu, ecoleInconnue, memeEcole])

  assert.deepEqual(appliques.map(a => a.statut).sort(), ['ecole_introuvable', 'enseignant_introuvable', 'meme_ecole'])
  assert.ok(appliques.every(a => a.motif.length > 0))
  assert.deepEqual(
    dataset.schools.map(s => s.nbEnseignantsEtat),
    donnees.schools.map(s => s.nbEnseignantsEtat),
    'aucun effectif ne bouge',
  )
})

test('Un enseignant ne peut faire l’objet que d’une décision : la suivante est écartée', () => {
  const donnees = jeu()
  const premiere = { ...decision(donnees, 'A-T1', 'B'), id: 'p1', decideLe: '2026-09-01T00:00:00.000Z' }
  const seconde = { ...decision(donnees, 'A-T1', 'C'), id: 'p2', decideLe: '2026-09-02T00:00:00.000Z' }
  const { dataset, appliques } = appliquerFaitsPrince(donnees, [seconde, premiere])

  assert.equal(appliques.find(a => a.fait.id === 'p1')!.statut, 'applique', 'l’ordre chronologique prime sur l’ordre de saisie')
  assert.equal(appliques.find(a => a.fait.id === 'p2')!.statut, 'doublon')
  assert.equal(dataset.teachers.find(x => x.id === 'A-T1')!.idEtabAttache, 'B')
})

test('Le contrôle de saisie ne refuse que les impossibilités matérielles', () => {
  const donnees = jeu()
  const diag = runDiagnostic(donnees.schools, DEFAULT_SETTINGS)
  const t = donnees.teachers.find(x => x.id === 'C-T1')!
  const vers = (id: string) => diag.bySchoolId[id]

  assert.equal(verifierFaitPrince(null, vers('B'), []).ok, false)
  assert.equal(verifierFaitPrince(t, null, []).ok, false)
  assert.equal(verifierFaitPrince(t, vers('C'), []).ok, false, 'déjà dans cette école')
  // Une école sans déficit, un enseignant sans excédent, un autre département : tout est permis.
  assert.equal(verifierFaitPrince(t, vers('A'), []).ok, true)
  assert.equal(verifierFaitPrince(t, vers('B'), []).ok, true)
  // Mais une seule décision par enseignant.
  const existante = decision(donnees, 'C-T1', 'B')
  assert.equal(verifierFaitPrince(t, vers('B'), [existante]).ok, false)
})

// --- Ce que l'algorithme en fait ---------------------------------------------

test('Le diagnostic est recalculé à partir des effectifs corrigés', () => {
  const donnees = jeu()
  const { dataset } = appliquerFaitsPrince(donnees, [decision(donnees, 'C-T1', 'B')])
  const avant = runDiagnostic(donnees.schools, DEFAULT_SETTINGS)
  const apres = runDiagnostic(dataset.schools, DEFAULT_SETTINGS)

  assert.equal(avant.bySchoolId.C.besoinTheorique, 0)
  assert.equal(apres.bySchoolId.C.besoinTheorique, 1, 'l’école d’origine passe en déficit')
  assert.equal(avant.bySchoolId.B.besoinTheorique, 3)
  assert.equal(apres.bySchoolId.B.besoinTheorique, 2, 'l’école de destination est moins en déficit')
})

test('L’algorithme tient compte de la décision : moins de postes, moins d’excédent, enseignant verrouillé', () => {
  const donnees = jeu()
  const scenario = scenarioGeographique('departement', DEFAULT_SETTINGS)

  const sans = runSimulation({ diagnostics: runDiagnostic(donnees.schools, DEFAULT_SETTINGS).schools, teachers: donnees.teachers, scenario })

  const { dataset, appliques } = appliquerFaitsPrince(donnees, [decision(donnees, 'A-T1', 'B')])
  const diag = runDiagnostic(dataset.schools, DEFAULT_SETTINGS)
  const avec = runSimulation({ diagnostics: diag.schools, teachers: dataset.teachers, scenario, faitsPrince: appliques })

  assert.equal(sans.besoinInitial, 3)
  assert.equal(avec.besoinInitial, 2, 'un des trois postes de B est déjà pourvu par la décision')
  assert.ok(avec.pool.excedentTotal < sans.pool.excedentTotal, 'l’excédent mobilisable de A diminue')
  assert.ok(avec.assignments.length <= 2)

  // L'enseignant redéployé est hors vivier et ne figure dans aucune proposition.
  assert.ok(!avec.pool.teachers.some(p => p.teacher.id === 'A-T1'))
  assert.ok(!avec.assignments.some(a => a.teacherId === 'A-T1'))
  assert.equal(avec.pool.exclusions.find(e => e.code === 'fait_prince')?.count, 1)

  // Le résultat garde la trace de la décision, son journal la mentionne, les contrôles la respectent.
  assert.equal(avec.faitsPrince.length, 1)
  assert.ok(avec.logs.some(l => l.etape === 'Fait de Prince' && l.valeur === 1))
  assert.ok(tousInvariantsOk(avec.invariants))
  assert.ok(avec.invariants.find(i => i.code === 'fait_prince_respecte')?.ok)
})

test('Un enseignant que l’algorithme n’aurait jamais mobilisé peut être redéployé, puis reste en place', () => {
  const donnees = jeu()
  const scenario = scenarioGeographique('etendu', DEFAULT_SETTINGS)

  // C est à l'équilibre : sans excédent, aucun de ses enseignants n'est dans le vivier.
  const sans = runSimulation({ diagnostics: runDiagnostic(donnees.schools, DEFAULT_SETTINGS).schools, teachers: donnees.teachers, scenario })
  assert.ok(!sans.pool.teachers.some(p => p.teacher.idEtabAttache === 'C'))

  const { dataset, appliques } = appliquerFaitsPrince(donnees, [decision(donnees, 'C-T1', 'B', 'Note de service n° 12')])
  const diag = runDiagnostic(dataset.schools, DEFAULT_SETTINGS)
  const avec = runSimulation({ diagnostics: diag.schools, teachers: dataset.teachers, scenario, faitsPrince: appliques })

  assert.equal(dataset.teachers.find(t => t.id === 'C-T1')!.idEtabAttache, 'B')
  assert.ok(!avec.assignments.some(a => a.teacherId === 'C-T1'), 'la décision de la DRH n’est pas remise en cause')
  // C est désormais en déficit d'un poste : c'est un poste de plus que l'algorithme doit couvrir.
  assert.equal(diag.bySchoolId.C.besoinTheorique, 1)
  const postesDeC =
    avec.assignments.filter(a => a.schoolDestinationId === 'C').length + avec.uncoveredPosts.filter(p => p.schoolId === 'C').length
  assert.equal(postesDeC, 1)
  assert.equal(avec.faitsPrince[0].fait.reference, 'Note de service n° 12')
  assert.ok(tousInvariantsOk(avec.invariants))
})

test('Deux exécutions avec les mêmes décisions donnent le même résultat', () => {
  const donnees = jeu()
  const effets = [decision(donnees, 'A-T1', 'B')]
  const scenario = scenarioGeographique('departement', DEFAULT_SETTINGS)
  const lancer = () => {
    const { dataset, appliques } = appliquerFaitsPrince(donnees, effets)
    const diag = runDiagnostic(dataset.schools, DEFAULT_SETTINGS)
    const r = runSimulation({ diagnostics: diag.schools, teachers: dataset.teachers, scenario, faitsPrince: appliques })
    return r.assignments.map(a => `${a.teacherId}>${a.postId}`)
  }
  assert.deepEqual(lancer(), lancer())
})

// --- Aide à la décision -------------------------------------------------------

test('L’impact prévisible signale ce que l’algorithme n’aurait pas fait, sans jamais l’interdire', () => {
  const donnees = jeu()
  const diag = runDiagnostic(donnees.schools, DEFAULT_SETTINGS)
  const t = donnees.teachers.find(x => x.id === 'C-T1')!

  // C → A : A n'est pas en déficit et C n'a pas d'excédent, et ce départ met C en déficit.
  const impact = simulerImpactPrince(t, diag.bySchoolId.C, diag.bySchoolId.A, DEFAULT_SETTINGS)
  assert.equal(impact.origine?.effectifApres, 4)
  assert.equal(impact.origine?.besoinApres, 1)
  assert.equal(impact.destination.effectifApres, 7)
  const texte = impact.observations.join(' ')
  assert.match(texte, /aucun excédent mobilisable/)
  assert.match(texte, /met l'école d'origine en déficit/)
  assert.match(texte, /n'est pas en déficit/)

  // A → B : B est en déficit, le poste est comblé.
  const utile = simulerImpactPrince(donnees.teachers.find(x => x.id === 'A-T1')!, diag.bySchoolId.A, diag.bySchoolId.B, DEFAULT_SETTINGS)
  assert.equal(utile.destination.besoinApres, 2)
  assert.match(utile.observations.join(' '), /comble un poste/)
})

test('Le statut de l’enseignant est signalé, pas bloquant', () => {
  const donnees = jeu()
  const diag = runDiagnostic(donnees.schools, DEFAULT_SETTINGS)
  const malade = enseignant({ id: 'M1', idEtabAttache: 'A', statut: 'malade' })
  const impact = simulerImpactPrince(malade, diag.bySchoolId.A, diag.bySchoolId.B, DEFAULT_SETTINGS)
  assert.match(impact.observations.join(' '), /n'aurait pas mobilisé cet enseignant/)
})

// --- Traçabilité ---------------------------------------------------------------

test('Le rapport décisionnel consigne les décisions de la DRH', () => {
  const donnees = jeu()
  const { dataset, appliques } = appliquerFaitsPrince(donnees, [decision(donnees, 'A-T1', 'B', 'Décision DRH 2026/45')])
  const diag = runDiagnostic(dataset.schools, DEFAULT_SETTINGS)
  const rapport = construireRapport({
    diagnostic: diag,
    diagnosticsFiltres: diag.schools,
    arbre: construireArbreTerritorial(diag.schools),
    qualite: null,
    resultat: null,
    comparaison: [],
    perimetre: 'Cameroun',
    settings: DEFAULT_SETTINGS,
    nbEnseignantsLus: dataset.teachers.length,
    donneesDemonstration: false,
    faitsPrince: appliques,
  })

  const section = rapport.sections.find(s => /Fait de Prince/.test(s.titre))
  assert.ok(section, 'une section dédiée existe')
  assert.match(section.paragraphes.join(' '), /1 redéploiement/)
  assert.ok(section.tableau?.lignes.some(l => l.join(' ').includes('Décision DRH 2026/45')))

  const sans = construireRapport({
    diagnostic: diag,
    diagnosticsFiltres: diag.schools,
    arbre: construireArbreTerritorial(diag.schools),
    qualite: null,
    resultat: null,
    comparaison: [],
    perimetre: 'Cameroun',
    settings: DEFAULT_SETTINGS,
    nbEnseignantsLus: dataset.teachers.length,
    donneesDemonstration: false,
  })
  assert.ok(!sans.sections.some(s => /Fait de Prince/.test(s.titre)), 'aucune section sans décision')
})
