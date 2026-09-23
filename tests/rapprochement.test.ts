/**
 * Rapprochement d'une saisie libre : c'est ce qui permet de désigner un
 * enseignant et une école en tapant leur nom, dans la page « Fait de Prince ».
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { rapprocherSaisie } from '../lib/data/rapprochement'

interface Personne {
  id: string
  nom: string
  prenom: string
}

const gens: Personne[] = [
  { id: 'T-001', nom: 'Hamadou', prenom: 'Joseph' },
  { id: 'T-002', nom: 'Mbarga', prenom: 'Estelle' },
  { id: 'T-003', nom: 'Mbarga', prenom: 'Félix' },
  { id: 'T-004', nom: 'Ngassa', prenom: 'Thérèse' },
]

const chercher = (saisie: string) =>
  rapprocherSaisie(
    saisie,
    gens,
    p => p.id,
    p => [`${p.nom} ${p.prenom}`, `${p.prenom} ${p.nom}`, p.nom],
  ).trouve

test('Le nom complet désigne la personne, quel que soit l’ordre', () => {
  assert.equal(chercher('Hamadou Joseph')?.id, 'T-001')
  assert.equal(chercher('Joseph Hamadou')?.id, 'T-001')
})

test('Les accents, la casse et la ponctuation sont ignorés', () => {
  assert.equal(chercher('ngassa therese')?.id, 'T-004')
  assert.equal(chercher('NGASSA  Thérèse')?.id, 'T-004')
  assert.equal(chercher('Mbarga, Félix')?.id, 'T-003')
})

test('Le matricule fonctionne aussi, et prime sur le nom', () => {
  assert.equal(chercher('T-002')?.id, 'T-002')
  assert.equal(chercher('t002')?.id, 'T-002', 'la ponctuation du matricule est ignorée')
})

test('Une saisie partielle suffit si elle ne désigne qu’une personne', () => {
  assert.equal(chercher('Hamadou')?.id, 'T-001')
  assert.equal(chercher('Estelle')?.id, 'T-002')
})

test('Une saisie ambiguë ne désigne personne', () => {
  // Deux Mbarga : impossible de trancher, on ne devine pas.
  assert.equal(chercher('Mbarga'), null)
})

test('Une saisie vide ou inconnue ne désigne personne', () => {
  assert.equal(chercher(''), null)
  assert.equal(chercher('   '), null)
  assert.equal(chercher('Inconnu'), null)
})

test('Le libellé exact l’emporte sur une correspondance partielle', () => {
  const ecoles = [
    { id: 'E1', nom: 'EP Douala V' },
    { id: 'E2', nom: 'EP Douala V Centre' },
  ]
  const trouver = (s: string) => rapprocherSaisie(s, ecoles, e => e.id, e => [e.nom]).trouve

  assert.equal(trouver('EP Douala V')?.id, 'E1', 'le nom exact désigne la première école')
  assert.equal(trouver('EP Douala V Centre')?.id, 'E2')
  assert.equal(trouver('Douala'), null, 'les deux conviennent : on ne choisit pas')
})

test('Les homonymes sont proposés au choix plutôt que départagés au hasard', () => {
  const resultat = rapprocherSaisie(
    'Mbarga',
    gens,
    p => p.id,
    p => [`${p.nom} ${p.prenom}`, `${p.prenom} ${p.nom}`, p.nom],
  )
  assert.equal(resultat.trouve, null, 'aucun choix n’est fait à la place de l’utilisateur')
  assert.deepEqual(
    resultat.candidats.map(c => c.id).sort(),
    ['T-002', 'T-003'],
    'les deux Mbarga sont proposés',
  )
})

test('Une saisie sans ambiguïté ne propose aucun candidat à départager', () => {
  const resultat = rapprocherSaisie(
    'Hamadou Joseph',
    gens,
    p => p.id,
    p => [`${p.nom} ${p.prenom}`, p.nom],
  )
  assert.equal(resultat.trouve?.id, 'T-001')
  assert.deepEqual(resultat.candidats, [])
})
