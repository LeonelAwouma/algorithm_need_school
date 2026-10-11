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

const settings = DEFAULT_SETTINGS
const cfg = settings.scoring

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
  assert.equal(calculerBaremeIndividuel(a, settings), calculerBaremeIndividuel(b, settings))
})

test('Les charges familiales pèsent réellement sur le barème : chaque enfant retire des points', () => {
  const base = { id: 'T', idEtabAttache: 'E1', situationFamiliale: 'Marié(e)', nbEnfants: 0 }
  const sansEnfant = calculerBaremeIndividuel(enseignant(base), settings)
  const avecEnfants = calculerBaremeIndividuel(enseignant({ ...base, nbEnfants: 4 }), settings)
  assert.ok(avecEnfants < sansEnfant, 'quatre enfants à charge abaissent le barème : la famille est moins mobile')
  assert.equal(
    Math.round((sansEnfant - avecEnfants) * 10000) / 10000,
    Math.round(4 * cfg.pointsParEnfant * cfg.poidsBaremeIndividuel.chargesFamiliales * 10000) / 10000,
    'l’écart vaut exactement enfants × points par enfant × poids C3',
  )

  const celibataire = calculerBaremeIndividuel(enseignant({ ...base, situationFamiliale: 'Célibataire' }), settings)
  assert.ok(celibataire > sansEnfant, 'un célibataire est plus mobile qu’un marié, toutes choses égales')
})

test('Un poids à zéro neutralise le critère', () => {
  const neutre = { ...settings, scoring: { ...cfg, poidsBaremeIndividuel: { ...cfg.poidsBaremeIndividuel, chargesFamiliales: 0 } } }
  const a = enseignant({ id: 'A', idEtabAttache: 'E1', situationFamiliale: 'Célibataire', nbEnfants: 0 })
  const b = enseignant({ id: 'B', idEtabAttache: 'E1', situationFamiliale: 'Marié(e)', nbEnfants: 6 })
  assert.equal(calculerBaremeIndividuel(a, neutre), calculerBaremeIndividuel(b, neutre))
})

test('Le détail du barème expose les cinq critères, et sa somme vaut le total', () => {
  const t = enseignant({ id: 'T', idEtabAttache: 'E1', situationFamiliale: 'Veuve', nbEnfants: 3 })
  const detail = detaillerBareme(t, settings)
  assert.deepEqual(detail.components.map(c => c.label.slice(0, 2)), ['C1', 'C2', 'C3', 'C4', 'C5'])
  assert.equal(detail.components[2].valeur, cfg.pointsSituationFamiliale.veuf - 3 * cfg.pointsParEnfant)

  const somme = Math.round(detail.components.reduce((a, c) => a + c.contribution, 0) * 10000) / 10000
  assert.equal(somme, detail.total)
  assert.equal(detail.total, calculerBaremeIndividuel(t, settings), 'le détail correspond au barème réellement utilisé')
})

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
