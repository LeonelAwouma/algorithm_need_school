/**
 * Transformation des lignes lues dans les classeurs en entités métier.
 *
 * Aucune valeur manquante n'est remplacée par une donnée inventée : un effectif
 * absent reste `null` et l'indicateur qui en dépend n'est simplement pas
 * calculé (§26). Seuls les champs où « absent » a un sens métier connu ont une
 * valeur par défaut explicite : un compteur absent vaut 0, un statut absent
 * vaut « actif », comme dans la version historique du moteur.
 */

import type {
  Accessibilite,
  MotifDemande,
  NiveauPrimaire,
  School,
  SousSysteme,
  Teacher,
  ZoneSecurite,
} from '../../types/education'
import type { ColumnMappingReport } from '../../types/data-quality'
import { champsResolus, makeAccessor } from './column-mapping'
import {
  ageFromBirthDate,
  intOrNull,
  lower,
  normalizeKey,
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

/** Sous-système : « francophone », « FR », « French »… ou « anglophone », « EN », « English »… */
export function parseSousSysteme(v: unknown): SousSysteme | null {
  const k = normalizeKey(v)
  if (!k) return null
  if (k.includes('franco') || k.includes('francais') || k.includes('french') || ['fr', 'f', 'fra', 'ssf'].includes(k)) return 'francophone'
  if (k.includes('anglo') || k.includes('anglais') || k.includes('english') || ['en', 'an', 'a', 'e', 'ang', 'eng', 'ssa'].includes(k)) return 'anglophone'
  return null
}

/** Zone de sécurité : verte, jaune ou rouge. */
export function parseZoneSecurite(v: unknown): ZoneSecurite | null {
  const k = normalizeKey(v)
  if (!k) return null
  if (k.includes('rouge') || k === 'red' || k === 'r') return 'rouge'
  if (k.includes('jaune') || k.includes('orange') || k === 'yellow' || k === 'j') return 'jaune'
  if (k.includes('vert') || k === 'green' || k === 'v') return 'verte'
  return null
}

/** Accessibilité : urbain, rural ou rural enclavé. */
export function parseAccessibilite(v: unknown): Accessibilite | null {
  const k = normalizeKey(v)
  if (!k) return null
  if (k.includes('enclav')) return 'rural_enclave'
  if (k.includes('semi') || k.includes('periurb')) return 'semi_urbain'
  if (k.includes('rural')) return 'rural'
  if (k.includes('urbain') || k.includes('urban') || k.includes('ville')) return 'urbain'
  return null
}

/** Motif d'une demande de mutation. */
export function parseMotif(v: unknown): MotifDemande | null {
  const k = normalizeKey(v)
  if (!k) return null
  if (k.includes('sante') || k.includes('medical') || k.includes('maladie') || k.includes('suivimed') || k.includes('handicap')) return 'sante'
  if (k.includes('regroupement') || k.includes('familial') || k.includes('conjoint') || k.includes('rapprochement')) return 'regroupement_familial'
  if (k.includes('rotation') || k.includes('difficile')) return 'rotation_zone_difficile'
  if (k.includes('convenance') || k.includes('personnel')) return 'convenance'
  return 'autre'
}

function zoneDepuisAccessibilite(a: Accessibilite | null): School['zone'] {
  if (a === 'urbain') return 'urbaine'
  if (a === 'semi_urbain') return 'semi_urbaine'
  if (a === 'rural' || a === 'rural_enclave') return 'rurale'
  return 'inconnue'
}

/**
 * Classes multigrades : un nombre de classes, ou une réponse « oui / non ». « Oui »
 * sans nombre signifie que les niveaux sont regroupés au maximum (6 classes
 * multigrades : le minimum pédagogique retombe sur le regroupement paramétré).
 */
export function parseMultigrades(v: unknown): number {
  const n = numOrNull(v)
  if (n != null) return Math.max(0, Math.trunc(n))
  const k = normalizeKey(v)
  if (['oui', 'o', 'yes', 'y', 'vrai', 'true', 'x'].includes(k)) return 6
  return 0
}

/** Délégation régionale, délégation départementale ou IAEB : structure d'accueil sans élèves. */
export function estTypeStructure(typeEtab: string): boolean {
  const k = normalizeKey(typeEtab)
  if (!k) return false
  return ['iaeb', 'dr', 'dd', 'dreb', 'ddeb', 'drebs', 'ddebs'].includes(k) || k.startsWith('iaeb') || k.includes('delegation') || k.startsWith('inspection')
}

/** Construit les établissements à partir des lignes et de la table de correspondance. */
export function parseSchools(records: SheetRecord[], mapping: ColumnMappingReport): School[] {
  const get = makeAccessor(mapping)
  const colonnes = champsResolus(mapping)
  const multigradesRenseignes = colonnes.has('classesMultigrades')
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
    const typeEtab = text(get(v, 'typeEtab'))
    const id = text(get(v, 'id'))
    const accessibiliteLue = parseAccessibilite(get(v, 'accessibilite'))
    // Format MINEDUB : salles en simple flux et en double flux, disjointes. Le total
    // des salles utilisables est alors leur somme (BMAX = S_SF + 2 × S_DF).
    const simpleFlux = intOrNull(get(v, 'sallesSimpleFlux'))
    const doubleFlux = intOrNull(get(v, 'sallesDoubleFlux'))
    const sallesLues = intOrNull(get(v, 'nbSallesClasse'))
    const nbSallesClasse = sallesLues ?? (simpleFlux != null ? simpleFlux + (doubleFlux ?? 0) : null)

    return {
      id,
      codeEcole: id,
      nom: text(get(v, 'nom')) || id,
      iaeb: text(get(v, 'iaeb')),
      latitude: numOrNull(get(v, 'latitude')),
      longitude: numOrNull(get(v, 'longitude')),
      region: text(get(v, 'region')),
      departement: text(get(v, 'departement')),
      commune: text(get(v, 'commune')),
      // Sans colonne « Zone », le milieu est déduit de l'accessibilité (format MINEDUB).
      zone: zoneBrute ? parseZone(zoneBrute) : zoneDepuisAccessibilite(accessibiliteLue),
      zoneBrute: zoneBrute || text(get(v, 'accessibilite')),
      typeEtab,

      nbClasses: Math.max(0, Math.trunc(num(get(v, 'nbClasses'), 0))),
      nbSallesClasse,
      sallesDoubleFlux: doubleFlux,
      niveauxOuverts: intOrNull(get(v, 'niveauxOuverts')),
      departsConnusDeclares: intOrNull(get(v, 'departsConnus')),
      sousSysteme: parseSousSysteme(get(v, 'sousSysteme')),
      zoneSecurite: parseZoneSecurite(get(v, 'zoneSecurite')),
      // « Rural enclavé » peut aussi être écrit dans la colonne Zone.
      accessibilite: accessibiliteLue ?? (normalizeKey(zoneBrute).includes('enclav') ? 'rural_enclave' : null),
      estStructure: estTypeStructure(typeEtab),
      nbEnseignantsEtat: Math.trunc(num(get(v, 'nbEnseignantsEtat'), 0)),
      nbAutresEnseignants: intOrNull(get(v, 'nbAutresEnseignants')),

      nbPostesOuvertsDeclares: intOrNull(get(v, 'nbPostesOuvertsDeclares')),

      classesMultigrades: parseMultigrades(get(v, 'classesMultigrades')),
      classesMultigradesRenseignees: multigradesRenseignes,
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
    const ageLu = numOrNull(get(v, 'age'))
    const id = text(get(v, 'id'))
    const voeux = ['voeu1', 'voeu2', 'voeu3'].map(c => text(get(v, c))).filter(x => x !== '' && !['nan', 'none', 'n/a', 'na', 'null', '-'].includes(x.toLowerCase()))
    const motifBrut = text(get(v, 'motifDemande'))
    // Un motif rédigé librement peut nommer l'école qu'il vise : elle reçoit alors la bonification.
    const ecoleCitee = voeux.find(code => code && motifBrut.toLowerCase().includes(code.toLowerCase())) ?? null

    const communeLue = text(get(v, 'communeAttache'))
    const departementLu = text(get(v, 'departementAttache'))
    const regionLue = text(get(v, 'regionAttache'))
    const zoneLue = text(get(v, 'zoneAttache'))

    return {
      id,
      nom: text(get(v, 'nom')) || id,
      prenom: text(get(v, 'prenom')),
      dateNaissance,
      // La date de naissance prime ; à défaut, la colonne « Age » du fichier.
      age: ageFromBirthDate(dateNaissance, reference) ?? (ageLu != null && ageLu > 0 && ageLu < 100 ? ageLu : null),

      idEtabAttache,
      communeAttache: communeLue || ecole?.commune || '',
      departementAttache: departementLu || ecole?.departement || '',
      regionAttache: regionLue || ecole?.region || '',
      zoneAttache: zoneLue ? parseZone(zoneLue) : ecole?.zone ?? 'inconnue',
      iaebAttache: ecole?.iaeb ?? '',

      ancienneteCarriereAns: Math.max(0, num(get(v, 'ancienneteCarriereAns'), 0)),
      anciennetePosteAns: Math.max(0, num(get(v, 'anciennetePosteAns'), 0)),
      situationFamiliale: lower(get(v, 'situationFamiliale')),
      nbEnfants: Math.max(0, num(get(v, 'nbEnfants'), 0)),
      formationContinue: Math.max(0, num(get(v, 'formationContinue'), 0)),

      statut: lower(get(v, 'statut')) || 'actif',
      payeParEtat: parseBoolean(get(v, 'payeParEtat'), true),

      sexe: text(get(v, 'sexe')),
      categorie: text(get(v, 'categorie')),
      fonction: text(get(v, 'fonction')),
      sousSysteme: parseSousSysteme(get(v, 'sousSystemeEns')) ?? ecole?.sousSysteme ?? null,
      voeux,
      motifDemande: parseMotif(motifBrut),
      ecoleMotif: text(get(v, 'ecoleMotif')) || ecoleCitee,
      anneesZoneNiveau1: Math.max(0, num(get(v, 'anneesZoneNiveau1'), 0)),
      anneesZoneNiveau2: Math.max(0, num(get(v, 'anneesZoneNiveau2'), 0)),
      rangTirage: intOrNull(get(v, 'rangTirage')),

      ligneSource: record.ligne,
    }
  })
}

const SUFFIXE: Record<SousSysteme, string> = { francophone: 'FR', anglophone: 'EN' }

/**
 * Écoles bilingues (référentiel §2.4) : une école dont le fichier contient une
 * ligne par section — même code, sous-systèmes différents — forme deux unités de
 * calcul, « CODE-FR » et « CODE-EN », chacune avec ses élèves, ses salles et ses
 * maîtres. Les enseignants sont rattachés à la section de leur sous-système.
 * Les vœux restent exprimés par code d'école : la section est choisie au moment
 * de l'examen, d'après le sous-système de l'enseignant.
 */
export function separerSectionsBilingues(schools: School[], teachers: Teacher[]): { schools: School[]; teachers: Teacher[] } {
  const parCode = new Map<string, School[]>()
  for (const s of schools) parCode.set(s.id, [...(parCode.get(s.id) ?? []), s])

  const bilingues = new Map<string, School[]>()
  for (const [code, lignes] of parCode) {
    const sousSystemes = new Set(lignes.map(l => l.sousSysteme).filter(Boolean))
    if (code && lignes.length > 1 && sousSystemes.size > 1) bilingues.set(code, lignes)
  }
  if (bilingues.size === 0) return { schools, teachers }

  const vues = new Set<string>()
  const unites = schools.map(s => {
    if (!bilingues.has(s.id) || !s.sousSysteme) return s
    const id = `${s.id}-${SUFFIXE[s.sousSysteme]}`
    if (vues.has(id)) return s
    vues.add(id)
    return { ...s, id, codeEcole: s.id, nom: `${s.nom} (section ${s.sousSysteme})` }
  })

  const rattaches = teachers.map(t => {
    const sections = bilingues.get(t.idEtabAttache)
    if (!sections) return t
    // Sans sous-système déclaré, l'enseignant est rattaché à la première section du fichier.
    const sousSysteme = t.sousSysteme ?? sections[0].sousSysteme
    if (!sousSysteme) return t
    return { ...t, idEtabAttache: `${t.idEtabAttache}-${SUFFIXE[sousSysteme]}`, sousSysteme }
  })

  return { schools: unites, teachers: rattaches }
}

/** Valeur numérique brute d'une colonne, utilisée par le contrôle qualité. */
export function valeurNumeriqueBrute(
  values: Record<string, unknown>,
  mapping: ColumnMappingReport,
  champ: string,
): number | null {
  return numOrNull(makeAccessor(mapping)(values, champ))
}
