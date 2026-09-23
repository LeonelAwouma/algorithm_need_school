/**
 * Situation matrimoniale et nombre d'enfants dans le barème.
 *
 * Ces deux critères pèsent sur le classement des enseignants. Encore faut-il que
 * les libellés réels des fichiers soient reconnus : « Marié(e) » doit compter
 * autant que « marie », sans quoi le critère est neutralisé en silence.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { DEFAULT_SETTINGS } from '../lib/config/settings'
import { inventaireSituations, libelleSituation, normaliserSituation } from '../lib/data/situation-familiale'
import { calculerBaremeIndividuel, detaillerBareme, pointsSituation } from '../lib/simulation/scoring'
import { enseignant } from './fixtures'

const cfg = DEFAULT_SETTINGS.scoring

// --- Rapprochement des graphies ----------------------------------------------

test('Les graphies réelles d’une même situation sont rapprochées', () => {
  for (const v of ['marie', 'Marié', 'Mariée', 'MARIE(E)', 'marié(e)', 'Époux', 'épouse']) {
    assert.equal(normaliserSituation(v), 'marie', `« ${v} » devrait valoir « marié »`)
  }
  for (const v of ['celibataire', 'Célibataire', 'CÉLIBATAIRE', 'célibataires']) {
    assert.equal(normaliserSituation(v), 'celibataire')
  }
  assert.equal(normaliserSituation('Veuve'), 'veuf')
  assert.equal(normaliserSituation('Divorcée'), 'divorce')
  assert.equal(normaliserSituation('Séparé'), 'separe')
  assert.equal(normaliserSituation('Union libre'), 'concubinage')
})

test('Une valeur inconnue ou vide n’est jamais rattachée au hasard', () => {
  assert.equal(normaliserSituation('Fiancé'), null)
  assert.equal(normaliserSituation(''), null)
  assert.equal(normaliserSituation(null), null)
  assert.equal(normaliserSituation('   '), null)
})

test('Le libellé affiché reste lisible, y compris pour une valeur non reconnue', () => {
  assert.equal(libelleSituation('MARIE(E)'), 'Marié(e)')
  assert.equal(libelleSituation('Veuve'), 'Veuf / Veuve')
  assert.equal(libelleSituation('Fiancé'), 'Fiancé', 'la valeur brute est conservée')
  assert.equal(libelleSituation(''), 'Non renseignée')
})

// --- Effet réel sur le barème --------------------------------------------------

test('Toutes les graphies d’une situation donnent les mêmes points', () => {
  const attendu = cfg.pointsSituationFamiliale.marie
  for (const v of ['marie', 'Marié', 'Mariée', 'MARIE(E)', 'épouse']) {
    assert.equal(pointsSituation(v, cfg), attendu, `« ${v} »`)
  }
  assert.equal(pointsSituation('Célibataire', cfg), cfg.pointsSituationFamiliale.celibataire)
  assert.equal(pointsSituation('Fiancé', cfg), 0, 'une valeur non reconnue vaut 0')
})

test('Deux enseignants identiques hormis la graphie ont le même barème', () => {
  const a = enseignant({ id: 'A', idEtabAttache: 'E1', situationFamiliale: 'celibataire' })
  const b = enseignant({ id: 'B', idEtabAttache: 'E1', situationFamiliale: 'Célibataire' })
  assert.equal(calculerBaremeIndividuel(a, cfg), calculerBaremeIndividuel(b, cfg))
})

test('Le nombre d’enfants et la situation pèsent réellement sur le barème', () => {
  const base = { id: 'T', idEtabAttache: 'E1', situationFamiliale: 'Marié(e)', nbEnfants: 0 }
  const sansEnfant = calculerBaremeIndividuel(enseignant(base), cfg)
  const avecEnfants = calculerBaremeIndividuel(enseignant({ ...base, nbEnfants: 4 }), cfg)
  assert.ok(avecEnfants > sansEnfant, 'quatre enfants augmentent le barème')
  assert.equal(
    Math.round((avecEnfants - sansEnfant) * 10000) / 10000,
    Math.round(4 * cfg.poidsBaremeIndividuel.nbEnfants * 10000) / 10000,
    'la contribution vaut exactement nombre d’enfants × poids',
  )

  const celibataire = calculerBaremeIndividuel(enseignant({ ...base, situationFamiliale: 'Célibataire' }), cfg)
  assert.ok(celibataire > sansEnfant, 'un célibataire est mieux classé qu’un marié, toutes choses égales')
})

test('Un poids à zéro neutralise le critère', () => {
  const neutre = { ...cfg, poidsBaremeIndividuel: { ...cfg.poidsBaremeIndividuel, nbEnfants: 0, situationFamiliale: 0 } }
  const a = enseignant({ id: 'A', idEtabAttache: 'E1', situationFamiliale: 'Célibataire', nbEnfants: 0 })
  const b = enseignant({ id: 'B', idEtabAttache: 'E1', situationFamiliale: 'Marié(e)', nbEnfants: 6 })
  assert.equal(calculerBaremeIndividuel(a, neutre), calculerBaremeIndividuel(b, neutre))
})

test('Le détail du barème expose les deux critères, et sa somme vaut le total', () => {
  const t = enseignant({ id: 'T', idEtabAttache: 'E1', situationFamiliale: 'Veuve', nbEnfants: 3 })
  const detail = detaillerBareme(t, cfg)
  const labels = detail.components.map(c => c.label)

  assert.ok(labels.some(l => /enfants/i.test(l)), 'le nombre d’enfants est listé')
  assert.ok(labels.some(l => /situation familiale/i.test(l)), 'la situation familiale est listée')
  assert.equal(detail.components.find(c => /enfants/i.test(c.label))?.valeur, 3)
  assert.equal(detail.components.find(c => /situation familiale/i.test(c.label))?.valeur, cfg.pointsSituationFamiliale.veuf)

  const somme = Math.round(detail.components.reduce((a, c) => a + c.contribution, 0) * 10000) / 10000
  assert.equal(somme, detail.total)
  assert.equal(detail.total, calculerBaremeIndividuel(t, cfg), 'le détail correspond au barème réellement utilisé')
})

// --- Inventaire montré dans les paramètres -------------------------------------

test('L’inventaire distingue reconnues, non reconnues et non renseignées', () => {
  const inv = inventaireSituations(['Marié', 'mariée', 'MARIE(E)', 'Célibataire', 'Fiancé', 'Fiancé', '', '   ', 'Veuve'])

  const marie = inv.reconnues.find(r => r.cle === 'marie')
  assert.equal(marie?.effectif, 3)
  assert.deepEqual(marie?.graphies, ['MARIE(E)', 'Marié', 'mariée'], 'les graphies rencontrées sont conservées')

  assert.deepEqual(inv.nonReconnues, [{ valeur: 'Fiancé', effectif: 2 }])
  assert.equal(inv.nonRenseignees, 2)
  assert.equal(inv.reconnues[0].cle, 'marie', 'classement par effectif décroissant')
})

test('Les six situations connues ont toutes un libellé et des points par défaut', () => {
  for (const cle of ['celibataire', 'marie', 'divorce', 'veuf', 'separe', 'concubinage'] as const) {
    assert.ok(libelleSituation(cle).length > 0, cle)
    assert.equal(typeof cfg.pointsSituationFamiliale[cle], 'number', `${cle} doit avoir des points par défaut`)
  }
})
