/**
 * Transformation des lignes lues dans les classeurs en entités métier.
 *
 * Aucune valeur manquante n'est remplacée par une donnée inventée : un effectif
 * absent reste `null` et l'indicateur qui en dépend n'est simplement pas
 * calculé (§26). Seuls les champs où « absent » a un sens métier connu ont une
 * valeur par défaut explicite : un compteur absent vaut 0, un statut absent
 * vaut « actif », comme dans la version historique du moteur.
 */

import type { NiveauPrimaire, School, Teacher } from '../../types/education'
import type { ColumnMappingReport } from '../../types/data-quality'
import { makeAccessor } from './column-mapping'
import {
  ageFromBirthDate,
  intOrNull,
  lower,
  num,
  numOrNull,
  parseBoolean,
  parseDateValue,
  parseZone,
  text,
  type SheetRecord,
} from './normalize'

const NIVEAU_CHAMPS: { champ: string; niveau: NiveauPrimaire }[] = [
  { champ: 'effectifCI', niveau: 'CI' },
  { champ: 'effectifCP', niveau: 'CP' },
  { champ: 'effectifCE1', niveau: 'CE1' },
  { champ: 'effectifCE2', niveau: 'CE2' },
  { champ: 'effectifCM1', niveau: 'CM1' },
  { champ: 'effectifCM2', niveau: 'CM2' },
]

/** Construit les établissements à partir des lignes et de la table de correspondance. */
export function parseSchools(records: SheetRecord[], mapping: ColumnMappingReport): School[] {
  const get = makeAccessor(mapping)
  return records.map(record => {
    const v = record.values
    const effectifParNiveau: Partial<Record<NiveauPrimaire, number>> = {}
    for (const { champ, niveau } of NIVEAU_CHAMPS) {
      const valeur = intOrNull(get(v, champ))
      if (valeur != null) effectifParNiveau[niveau] = valeur
    }

    // Un total d'élèves absent peut être reconstitué à partir des niveaux
    // renseignés : ce n'est pas une invention, c'est la somme des données lues.
    const totalLu = intOrNull(get(v, 'effectifTotalEleves'))
    const sommeNiveaux = Object.values(effectifParNiveau).reduce<number>((a, b) => a + b, 0)
    const effectifTotalEleves = totalLu ?? (Object.keys(effectifParNiveau).length > 0 ? sommeNiveaux : null)

    const zoneBrute = text(get(v, 'zone'))

    return {
      id: text(get(v, 'id')),
      nom: text(get(v, 'nom')),
      region: text(get(v, 'region')),
      departement: text(get(v, 'departement')),
      commune: text(get(v, 'commune')),
      zone: parseZone(zoneBrute),
      zoneBrute,
      typeEtab: text(get(v, 'typeEtab')),

      nbClasses: Math.max(0, Math.trunc(num(get(v, 'nbClasses'), 0))),
      nbSallesClasse: intOrNull(get(v, 'nbSallesClasse')),
      nbEnseignantsEtat: Math.trunc(num(get(v, 'nbEnseignantsEtat'), 0)),
      nbAutresEnseignants: intOrNull(get(v, 'nbAutresEnseignants')),

      nbPostesOuvertsDeclares: intOrNull(get(v, 'nbPostesOuvertsDeclares')),

      classesMultigrades: Math.max(0, Math.trunc(num(get(v, 'classesMultigrades'), 0))),
      prioriteLocale: Math.trunc(num(get(v, 'prioriteLocale'), 0)),

      effectifTotalEleves,
      effectifFilles: intOrNull(get(v, 'effectifFilles')),
      effectifGarcons: intOrNull(get(v, 'effectifGarcons')),
      effectifParNiveau,

      ligneSource: record.ligne,
    }
  })
}

/** Statuts qui écartent définitivement un enseignant du vivier (règle historique). */
export const STATUTS_EXCLUS = new Set(['malade', 'abandon', 'retraite', 'decede', 'detache'])

/**
 * Construit les enseignants. Les champs territoriaux manquants sont hérités de
 * l'école de rattachement quand celle-ci est connue — c'est une reprise de
 * donnée existante, pas une extrapolation.
 */
export function parseTeachers(
  records: SheetRecord[],
  mapping: ColumnMappingReport,
  schools: School[],
  reference: Date = new Date(),
): Teacher[] {
  const get = makeAccessor(mapping)
  const parEcole = new Map(schools.map(s => [s.id, s]))

  return records.map(record => {
    const v = record.values
    const idEtabAttache = text(get(v, 'idEtabAttache'))
    const ecole = parEcole.get(idEtabAttache)
    const dateNaissance = parseDateValue(get(v, 'dateNaissance'))

    const communeLue = text(get(v, 'communeAttache'))
    const departementLu = text(get(v, 'departementAttache'))
    const regionLue = text(get(v, 'regionAttache'))
    const zoneLue = text(get(v, 'zoneAttache'))

    return {
      id: text(get(v, 'id')),
      nom: text(get(v, 'nom')),
      prenom: text(get(v, 'prenom')),
      dateNaissance,
      age: ageFromBirthDate(dateNaissance, reference),

      idEtabAttache,
      communeAttache: communeLue || ecole?.commune || '',
      departementAttache: departementLu || ecole?.departement || '',
      regionAttache: regionLue || ecole?.region || '',
      zoneAttache: zoneLue ? parseZone(zoneLue) : ecole?.zone ?? 'inconnue',

      ancienneteCarriereAns: Math.max(0, num(get(v, 'ancienneteCarriereAns'), 0)),
      anciennetePosteAns: Math.max(0, num(get(v, 'anciennetePosteAns'), 0)),
      situationFamiliale: lower(get(v, 'situationFamiliale')),
      nbEnfants: Math.max(0, num(get(v, 'nbEnfants'), 0)),
      formationContinue: Math.max(0, num(get(v, 'formationContinue'), 0)),

      statut: lower(get(v, 'statut')) || 'actif',
      payeParEtat: parseBoolean(get(v, 'payeParEtat'), true),

      ligneSource: record.ligne,
    }
  })
}

/** Valeur numérique brute d'une colonne, utilisée par le contrôle qualité. */
export function valeurNumeriqueBrute(
  values: Record<string, unknown>,
  mapping: ColumnMappingReport,
  champ: string,
): number | null {
  return numOrNull(makeAccessor(mapping)(values, champ))
}
