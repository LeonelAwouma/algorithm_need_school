/**
 * Périmètre d'un délégué régional : le jeu de données est réduit à sa région
 * avant tout calcul. Le serveur devra appliquer la même règle.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { estDansRegion, restreindreARegion } from '../lib/acces/perimetre'
import type { Dataset } from '../types/simulation'
import { ecole, enseignantsDe } from './fixtures'

const T0 = new Date(Date.UTC(2026, 8, 30, 8, 0, 0))

test('Un délégué ne reçoit que les écoles et les enseignants de sa région', () => {
  const dataset: Dataset = {
    schools: [
      ecole({ id: 'C1', region: 'Centre' }),
      ecole({ id: 'C2', region: 'centre' }),
      ecole({ id: 'E1', region: 'Est' }),
      ecole({ id: 'N1', region: 'Far North' }),
    ],
    teachers: [
      ...enseignantsDe('C1', 2),
      ...enseignantsDe('E1', 3),
      ...enseignantsDe('N1', 1),
      ...enseignantsDe('INCONNUE', 1),
    ],
    demonstration: false,
    importedAt: T0.toISOString(),
    sourceFiles: { etablissements: null, enseignants: null },
  }

  const centre = restreindreARegion(dataset, 'Centre')
  assert.deepEqual(
    centre.schools.map(s => s.id),
    ['C1', 'C2'],
    'la casse du fichier n’exclut pas une école',
  )
  assert.equal(centre.teachers.length, 2)
  assert.ok(centre.teachers.every(t => t.idEtabAttache === 'C1'))

  const nord = restreindreARegion(dataset, 'Extrême-Nord')
  assert.deepEqual(
    nord.schools.map(s => s.id),
    ['N1'],
    'un libellé anglais est rattaché à sa région',
  )

  assert.equal(dataset.schools.length, 4, 'le jeu d’origine n’est pas modifié')
  assert.ok(!estDansRegion('Nord-Ouest', 'Nord'), 'deux régions voisines par le nom ne sont pas confondues')
})
