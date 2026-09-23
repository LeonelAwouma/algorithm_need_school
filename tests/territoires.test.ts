/**
 * Rapprochement des libellés territoriaux avec le fond de carte, et lectures
 * territoriales d'un résultat de simulation (destination, origine, flux).
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'

import { runDiagnostic } from '../lib/analytics/diagnostic'
import { DEFAULT_SETTINGS } from '../lib/config/settings'
import { runSimulation } from '../lib/simulation/engine'
import { scenarioGeographique } from '../lib/simulation/scenarios'
import { calculerFlux, resultatParOrigine, restreindreResultat, sensDuMouvement } from '../lib/simulation/filter'
import {
  REGIONS_CAMEROUN,
  apparierFeatures,
  boiteEnglobante,
  memeTerritoire,
  nomDeFeature,
  normaliserRegion,
  reparerEncodage,
  type GeoFeatureCollection,
} from '../lib/geography/cameroon'
import { ecole, enseignantsDe } from './fixtures'

// --- Rapprochement des libellés -------------------------------------------

test('Les libellés anglais des fonds de carte sont rapprochés des régions françaises', () => {
  assert.equal(normaliserRegion('Far North'), 'Extrême-Nord')
  assert.equal(normaliserRegion('North-West'), 'Nord-Ouest')
  assert.equal(normaliserRegion('South-West'), 'Sud-Ouest')
  assert.equal(normaliserRegion('East'), 'Est')
  assert.equal(normaliserRegion('West'), 'Ouest')
  assert.equal(normaliserRegion('Adamawa'), 'Adamaoua')
  assert.equal(normaliserRegion('Littoral'), 'Littoral')
  assert.equal(normaliserRegion('Mfoundi'), null, "un département n'est pas une région")
})

test('La comparaison de territoires tolère accents, casse et ponctuation', () => {
  assert.ok(memeTerritoire('Extrême-Nord', 'EXTREME NORD'))
  assert.ok(memeTerritoire('Lékié', 'Lekie'))
  assert.ok(memeTerritoire("Nyong-et-So'o", 'Nyong-et-So'), 'une variante de graphie reste appariée')
  assert.ok(memeTerritoire('Far North', 'Extrême-Nord'), 'via la table des alias de régions')
})

test('La tolérance ne confond pas deux territoires réellement différents', () => {
  assert.ok(!memeTerritoire('Nord', 'Sud'))
  assert.ok(!memeTerritoire('Nord', 'Nord-Ouest'), "deux régions distinctes ne sont jamais fusionnées")
  assert.ok(!memeTerritoire('Mfoundi', 'Mefou-et-Afamba'))
  assert.ok(!memeTerritoire('Mifi', 'Nifi'), 'les libellés courts exigent une égalité stricte')
})

test('Le fond de carte des régions, quand il est installé, couvre les dix régions', () => {
  const chemin = 'public/geo/cameroun-regions.geojson'
  if (!existsSync(chemin)) return // fond de carte optionnel : rien à vérifier

  const geo = JSON.parse(readFileSync(chemin, 'utf8')) as GeoFeatureCollection
  assert.equal(geo.type, 'FeatureCollection')

  const appariees = apparierFeatures(geo.features, [...REGIONS_CAMEROUN])
  const nonApparies = appariees.filter(a => a.territoire === null).map(a => a.nomGeo)
  assert.deepEqual(nonApparies, [], `entités non rapprochées : ${nonApparies.join(', ')}`)

  const couvertes = new Set(appariees.map(a => a.territoire))
  assert.equal(couvertes.size, 10, 'les dix régions sont représentées')

  const boite = boiteEnglobante(geo.features)
  assert.ok(boite, 'la collection contient des géométries exploitables')
  assert.ok(boite.minX > 8 && boite.maxX < 17, 'longitudes dans les limites du Cameroun')
  assert.ok(boite.minY > 1 && boite.maxY < 14, 'latitudes dans les limites du Cameroun')
})

test('Le fond de carte des départements, quand il est installé, est exploitable', () => {
  const chemin = 'public/geo/cameroun-departements.geojson'
  if (!existsSync(chemin)) return

  const geo = JSON.parse(readFileSync(chemin, 'utf8')) as GeoFeatureCollection
  assert.ok(geo.features.length > 40, 'le fichier contient les départements')
  assert.ok(
    geo.features.every(f => nomDeFeature(f) !== null),
    'chaque entité porte un libellé exploitable',
  )
})

test("Les communes numérotées d'une même ville ne sont jamais confondues", () => {
  assert.ok(!memeTerritoire('Yaoundé I', 'Yaoundé II'))
  assert.ok(!memeTerritoire('Douala III', 'Douala IV'))
  assert.ok(!memeTerritoire('Bafoussam I', 'Bafoussam II'))
  assert.ok(memeTerritoire('Yaoundé II', 'YAOUNDE II'), "l'égalité stricte reste reconnue")

  // Le rapprochement retient l'homonyme exact, même si une variante proche le précède.
  const geo = [{ type: 'Feature' as const, properties: { nom: 'Yaoundé II' }, geometry: null }]
  const [a] = apparierFeatures(geo, ['Yaoundé I', 'Yaoundé II'])
  assert.equal(a.territoire, 'Yaoundé II')
  const [b] = apparierFeatures(geo, ['Yaoundé I'])
  assert.equal(b.territoire, null, "« Yaoundé II » n'est pas rattaché à « Yaoundé I »")
})

test('Un libellé encodé deux fois est réparé, un libellé sain est laissé intact', () => {
  assert.equal(reparerEncodage('MÃ©long'), 'Mélong')
  assert.equal(reparerEncodage('FokouÃ©'), 'Fokoué')
  assert.equal(reparerEncodage('Yaoundé I'), 'Yaoundé I')
  assert.equal(reparerEncodage('Mbonge'), 'Mbonge')
  assert.equal(reparerEncodage('Ã'), 'Ã', "une séquence qui n'est pas de l'UTF-8 valide reste inchangée")
})

test("Le fond de carte des arrondissements, quand il est installé, est exploitable", () => {
  const chemin = 'public/geo/cameroun-arrondissements.geojson'
  if (!existsSync(chemin)) return

  const geo = JSON.parse(readFileSync(chemin, 'utf8')) as GeoFeatureCollection
  assert.ok(geo.features.length > 300, 'le fichier contient les arrondissements')
  const noms = geo.features.map(f => nomDeFeature(f))
  assert.ok(noms.every(n => n !== null), 'chaque entité porte un libellé exploitable')
  assert.ok(noms.every(n => !/[ÃÂ]/.test(n ?? '')), 'aucun libellé ne reste mal encodé')
  assert.ok(noms.includes('Mélong'), 'les accents sont rétablis')

  const boite = boiteEnglobante(geo.features)
  assert.ok(boite && boite.minX > 8 && boite.maxX < 17 && boite.minY > 1 && boite.maxY < 14, 'coordonnées dans les limites du Cameroun')
})

// --- Lectures territoriales d'un résultat ----------------------------------

/**
 * Deux régions : le Centre dispose d'un excédent, l'Est d'un déficit. En
 * scénario étendu, le Centre cède des enseignants à l'Est.
 */
const schools = [
  ecole({ id: 'CENTRE-1', region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé I', nbClasses: 4, nbEnseignantsEtat: 7 }),
  ecole({ id: 'CENTRE-2', region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé I', nbClasses: 6, nbEnseignantsEtat: 4 }),
  ecole({ id: 'EST-1', region: 'Est', departement: 'Kadey', commune: 'Batouri', nbClasses: 8, nbEnseignantsEtat: 4 }),
]
const teachers = enseignantsDe('CENTRE-1', 7, { regionAttache: 'Centre', departementAttache: 'Mfoundi', communeAttache: 'Yaoundé I' })

const diagnostic = runDiagnostic(schools, DEFAULT_SETTINGS)
const etendu = runSimulation({
  diagnostics: diagnostic.schools,
  teachers,
  scenario: scenarioGeographique('etendu', DEFAULT_SETTINGS),
})

const idsCentre = new Set(['CENTRE-1', 'CENTRE-2'])
const idsEst = new Set(['EST-1'])

test('Le scénario étendu fait bien circuler des enseignants entre régions', () => {
  assert.equal(diagnostic.bySchoolId['CENTRE-1'].excedentTheorique, 3)
  assert.equal(etendu.postesCouverts, 3)
  assert.ok(etendu.assignments.some(a => a.regionDestination === 'Est'), 'au moins un mouvement vers l’Est')
  assert.ok(etendu.assignments.every(a => a.regionOrigine === 'Centre'))
})

test('Le sens d’un mouvement dépend du territoire depuis lequel on l’observe', () => {
  const versEst = etendu.assignments.find(a => a.schoolDestinationId === 'EST-1')
  assert.ok(versEst)
  assert.equal(sensDuMouvement(versEst, idsEst), 'entrant')
  assert.equal(sensDuMouvement(versEst, idsCentre), 'sortant')

  const interneCentre = etendu.assignments.find(a => a.schoolDestinationId === 'CENTRE-2')
  assert.ok(interneCentre)
  assert.equal(sensDuMouvement(interneCentre, idsCentre), 'interne')
  assert.equal(sensDuMouvement(interneCentre, idsEst), null)
})

test('La vue destination seule masque les enseignants cédés par un territoire', () => {
  const vueCentre = restreindreResultat(etendu, idsCentre)
  const fluxCentre = calculerFlux(etendu, idsCentre)

  // La vue destination ne voit que ce qui arrive dans le Centre…
  assert.equal(vueCentre.postesCouverts, fluxCentre.mouvementsInternes)
  // …alors que le Centre cède effectivement des enseignants à l'extérieur.
  assert.ok(fluxCentre.enseignantsSortants > 0, 'le Centre cède des enseignants')
  assert.equal(fluxCentre.enseignantsRecus, 0)
  assert.equal(fluxCentre.solde, -fluxCentre.enseignantsSortants)
})

test('Le flux d’un territoire bénéficiaire fait apparaître ses arrivées', () => {
  const fluxEst = calculerFlux(etendu, idsEst)
  assert.ok(fluxEst.enseignantsRecus > 0)
  assert.equal(fluxEst.enseignantsSortants, 0)
  assert.equal(fluxEst.solde, fluxEst.enseignantsRecus)
  assert.equal(fluxEst.mouvementsInternes, 0)
  assert.ok(fluxEst.originesExterieures[0].libelle.includes('Mfoundi'))
  assert.ok(fluxEst.originesExterieures[0].libelle.includes('Centre'))
})

test('Le flux conserve la cohérence besoin = couverts + résiduel sur le territoire', () => {
  for (const ids of [idsCentre, idsEst]) {
    const flux = calculerFlux(etendu, ids)
    assert.equal(flux.postesCouverts + flux.besoinResiduel, flux.besoinInitial)
    assert.equal(flux.postesCouverts, flux.enseignantsRecus + flux.mouvementsInternes)
  }
})

test('Les flux de tous les territoires se recomposent en totaux nationaux', () => {
  const fluxCentre = calculerFlux(etendu, idsCentre)
  const fluxEst = calculerFlux(etendu, idsEst)

  assert.equal(fluxCentre.besoinInitial + fluxEst.besoinInitial, etendu.besoinInitial)
  assert.equal(fluxCentre.postesCouverts + fluxEst.postesCouverts, etendu.postesCouverts)
  assert.equal(fluxCentre.besoinResiduel + fluxEst.besoinResiduel, etendu.besoinResiduel)
  assert.equal(fluxCentre.solde + fluxEst.solde, 0, 'les mouvements se compensent au niveau national')
})

test('La vue origine liste les mouvements partant du territoire', () => {
  const depuisCentre = resultatParOrigine(etendu, idsCentre)
  assert.equal(depuisCentre.length, etendu.assignments.length, 'tous les mouvements partent du Centre')
  assert.ok(depuisCentre.every(a => a.schoolOrigineId === 'CENTRE-1'))
})

test('Un scénario local rend chaque territoire autonome', () => {
  const local = runSimulation({
    diagnostics: diagnostic.schools,
    teachers,
    scenario: scenarioGeographique('commune', DEFAULT_SETTINGS),
  })
  const fluxCentre = calculerFlux(local, idsCentre)
  assert.ok(fluxCentre.autonome, 'aucun mouvement ne franchit la frontière du Centre')
  assert.equal(fluxCentre.enseignantsRecus, 0)
  assert.equal(fluxCentre.enseignantsSortants, 0)
  assert.equal(fluxCentre.solde, 0)
})
