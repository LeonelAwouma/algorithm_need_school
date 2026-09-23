/**
 * Moteur de contrôle qualité des données (§11).
 *
 * Le score est explicable par construction : il part de 100 et chaque point
 * retiré correspond à une famille de problèmes nommée, comptée et illustrée par
 * quelques lignes du fichier source. Aucun problème n'est masqué — les
 * avertissements restent visibles même quand le score est bon.
 */

import type {
  DataQualityReport,
  MissingFieldReport,
  QualityIssue,
  TerritorialCompleteness,
  ColumnMappingReport,
} from '../../types/data-quality'
import type { School, Teacher } from '../../types/education'
import { STUDENT_FIELDS } from '../data/column-aliases'
import { champsResolus, fieldsFor } from '../data/column-mapping'

/** Nombre d'exemples conservés par famille de problèmes. */
const MAX_EXEMPLES = 5

export interface QualityInput {
  schools: School[]
  teachers: Teacher[]
  schoolMapping: ColumnMappingReport
  teacherMapping: ColumnMappingReport
  /** Nombre de lignes non vides lues dans chaque fichier. */
  lignesEtablissements: number
  lignesEnseignants: number
}

interface IssueDraft {
  code: string
  severity: QualityIssue['severity']
  label: string
  consequence: string
  dataset: QualityIssue['dataset']
  /** Points retirés quand 100 % des lignes sont touchées ; la pénalité est proportionnelle. */
  penaliteMax: number
  exemples: string[]
  count: number
}

function draft(
  code: string,
  severity: QualityIssue['severity'],
  label: string,
  consequence: string,
  dataset: QualityIssue['dataset'],
  penaliteMax: number,
): IssueDraft {
  return { code, severity, label, consequence, dataset, penaliteMax, exemples: [], count: 0 }
}

function ajouter(d: IssueDraft, exemple: string): void {
  d.count++
  if (d.exemples.length < MAX_EXEMPLES) d.exemples.push(exemple)
}

function finaliser(d: IssueDraft, total: number): QualityIssue {
  const part = total > 0 ? d.count / total : 0
  // Une pénalité plancher évite qu'un problème réel disparaisse du score
  // simplement parce qu'il ne touche qu'une poignée de lignes sur des milliers.
  const penalite = d.count === 0 ? 0 : Math.max(0.5, Math.round(d.penaliteMax * part * 10) / 10)
  return {
    code: d.code,
    severity: d.severity,
    label: d.label,
    consequence: d.consequence,
    dataset: d.dataset,
    count: d.count,
    exemples: d.exemples,
    penalite: Math.round(Math.min(penalite, d.penaliteMax) * 10) / 10,
  }
}

function appreciation(score: number): DataQualityReport['appreciation'] {
  if (score >= 85) return 'Bonne'
  if (score >= 70) return 'Acceptable'
  if (score >= 50) return 'Fragile'
  return 'Insuffisante'
}

export function buildDataQualityReport(input: QualityInput): DataQualityReport {
  const { schools, teachers, schoolMapping, teacherMapping } = input
  const nbEcoles = schools.length
  const nbEnseignants = teachers.length

  // --- Colonnes attendues absentes -----------------------------------------
  const missingFields: MissingFieldReport[] = []
  for (const dataset of ['etablissements', 'enseignants'] as const) {
    const mapping = dataset === 'etablissements' ? schoolMapping : teacherMapping
    const resolus = champsResolus(mapping)
    for (const field of fieldsFor(dataset)) {
      if (resolus.has(field.champ)) continue
      missingFields.push({
        champ: field.champ,
        label: field.label,
        dataset,
        bloquant: field.requis,
        consequence: field.consequence,
      })
    }
  }

  const champsEcole = champsResolus(schoolMapping)
  const donneesElevesDisponibles = STUDENT_FIELDS.some(c => champsEcole.has(c))

  // --- Établissements -------------------------------------------------------
  const idEcoleManquant = draft('ecole_sans_id', 'erreur', 'établissements sans identifiant', "Ces lignes ne peuvent pas être rattachées à des enseignants ni comptées dans un territoire.", 'etablissements', 20)
  const nomManquant = draft('ecole_sans_nom', 'avertissement', 'établissements sans nom', "Ces écoles apparaissent sans libellé dans les tableaux.", 'etablissements', 5)
  const sansRegion = draft('ecole_sans_region', 'avertissement', 'établissements sans région', "Ces écoles sont regroupées sous « Région non renseignée » et sortent de la carte.", 'etablissements', 10)
  const sansDepartement = draft('ecole_sans_departement', 'avertissement', 'établissements sans département', 'Le scénario départemental ne peut pas les traiter.', 'etablissements', 10)
  const sansCommune = draft('ecole_sans_commune', 'avertissement', 'établissements sans commune', 'Le scénario local ne peut pas les traiter.', 'etablissements', 10)
  const classesIncoherentes = draft('classes_incoherentes', 'erreur', 'établissements avec un nombre de classes invalide', 'Le besoin et le minimum à conserver ne peuvent pas être calculés pour ces écoles.', 'etablissements', 15)
  const enseignantsNegatifs = draft('enseignants_negatifs', 'erreur', "établissements avec un effectif d'enseignants négatif", "L'excédent calculé serait faux ; ces écoles sont écartées du vivier.", 'etablissements', 15)
  const elevesNegatifs = draft('eleves_negatifs', 'erreur', 'établissements avec un effectif élèves négatif', 'Les indicateurs pédagogiques de ces écoles ne sont pas calculés.', 'etablissements', 10)
  const sexeIncoherent = draft('repartition_sexe', 'avertissement', 'établissements où filles + garçons ne correspond pas au total', 'La répartition par sexe affichée peut être inexacte.', 'etablissements', 4)
  const sallesInsuffisantes = draft('salles_insuffisantes', 'avertissement', 'établissements déclarant moins de salles que de classes', 'Signale une possible double vacation ou une donnée à vérifier.', 'etablissements', 3)
  const doublonsEcole = draft('doublon_ecole', 'erreur', "identifiants d'établissement en double", 'Seule la première ligne est retenue pour chaque identifiant en double.', 'etablissements', 15)

  const vusEcole = new Map<string, number>()
  const duplicates: DataQualityReport['duplicates'] = []
  for (const s of schools) {
    if (!s.id) ajouter(idEcoleManquant, `ligne ${s.ligneSource}`)
    else {
      const n = (vusEcole.get(s.id) ?? 0) + 1
      vusEcole.set(s.id, n)
      if (n === 2) ajouter(doublonsEcole, s.id)
    }
    if (!s.nom) ajouter(nomManquant, s.id || `ligne ${s.ligneSource}`)
    if (!s.region) ajouter(sansRegion, s.id || `ligne ${s.ligneSource}`)
    if (!s.departement) ajouter(sansDepartement, s.id || `ligne ${s.ligneSource}`)
    if (!s.commune) ajouter(sansCommune, s.id || `ligne ${s.ligneSource}`)
    if (!Number.isFinite(s.nbClasses) || s.nbClasses <= 0) ajouter(classesIncoherentes, s.id || `ligne ${s.ligneSource}`)
    if (s.nbEnseignantsEtat < 0) ajouter(enseignantsNegatifs, s.id || `ligne ${s.ligneSource}`)
    if (s.effectifTotalEleves != null && s.effectifTotalEleves < 0) ajouter(elevesNegatifs, s.id || `ligne ${s.ligneSource}`)
    if (s.effectifFilles != null && s.effectifGarcons != null && s.effectifTotalEleves != null) {
      if (s.effectifFilles + s.effectifGarcons !== s.effectifTotalEleves) ajouter(sexeIncoherent, s.id || `ligne ${s.ligneSource}`)
    }
    if (s.nbSallesClasse != null && s.nbClasses > 0 && s.nbSallesClasse < s.nbClasses) {
      ajouter(sallesInsuffisantes, s.id || `ligne ${s.ligneSource}`)
    }
  }
  for (const [id, n] of vusEcole) if (n > 1) duplicates.push({ dataset: 'etablissements', id, occurrences: n })

  // --- Enseignants ----------------------------------------------------------
  const idEnsManquant = draft('ens_sans_id', 'erreur', 'enseignants sans matricule', 'Ces lignes ne peuvent pas être contrôlées contre les doublons ni suivies dans une affectation.', 'enseignants', 20)
  const doublonsEns = draft('doublon_ens', 'erreur', 'matricules enseignants en double', "Seule la première occurrence est retenue, pour qu'un enseignant ne soit jamais affecté deux fois.", 'enseignants', 15)
  const sansEcole = draft('ens_sans_ecole', 'erreur', "enseignants sans école de rattachement", "Leur départ ne peut pas être contrôlé contre l'excédent de leur école : ils sont écartés du vivier.", 'enseignants', 15)
  const ecoleInconnue = draft('ens_ecole_inconnue', 'erreur', 'enseignants rattachés à une école inconnue', "Leur école n'existe pas dans le fichier établissements : ils sont écartés du vivier.", 'croisement', 15)
  const dateInvalide = draft('date_invalide', 'avertissement', 'enseignants avec une date de naissance illisible ou absente', "Les règles liées à l'âge sont neutralisées pour ces enseignants.", 'enseignants', 6)
  const ancienneteIncoherente = draft('anciennete_incoherente', 'avertissement', "enseignants dont l'ancienneté au poste dépasse l'ancienneté de carrière", 'Le barème individuel de ces enseignants est probablement surévalué.', 'enseignants', 5)
  const sansNom = draft('ens_sans_nom', 'avertissement', 'enseignants sans nom', 'Les propositions concernant ces enseignants sont difficiles à identifier.', 'enseignants', 4)

  const idsEcoles = new Set(schools.map(s => s.id).filter(Boolean))
  const vusEns = new Map<string, number>()
  const unknownSchools: DataQualityReport['unknownSchools'] = []
  for (const t of teachers) {
    const ref = t.id || `ligne ${t.ligneSource}`
    if (!t.id) ajouter(idEnsManquant, `ligne ${t.ligneSource}`)
    else {
      const n = (vusEns.get(t.id) ?? 0) + 1
      vusEns.set(t.id, n)
      if (n === 2) ajouter(doublonsEns, t.id)
    }
    if (!t.nom) ajouter(sansNom, ref)
    if (!t.idEtabAttache) ajouter(sansEcole, ref)
    else if (!idsEcoles.has(t.idEtabAttache)) {
      ajouter(ecoleInconnue, `${ref} → ${t.idEtabAttache}`)
      if (unknownSchools.length < 200) unknownSchools.push({ teacherId: t.id, schoolId: t.idEtabAttache })
    }
    if (t.dateNaissance == null) ajouter(dateInvalide, ref)
    if (t.anciennetePosteAns > t.ancienneteCarriereAns && t.ancienneteCarriereAns > 0) ajouter(ancienneteIncoherente, ref)
  }
  for (const [id, n] of vusEns) if (n > 1) duplicates.push({ dataset: 'enseignants', id, occurrences: n })

  // --- Complétude territoriale ---------------------------------------------
  const territorialCompleteness: TerritorialCompleteness = {
    avecRegion: schools.filter(s => !!s.region).length,
    avecDepartement: schools.filter(s => !!s.departement).length,
    avecCommune: schools.filter(s => !!s.commune).length,
    total: nbEcoles,
    tauxComplet: nbEcoles === 0 ? 0 : schools.filter(s => s.region && s.departement && s.commune).length / nbEcoles,
  }

  // --- Assemblage -----------------------------------------------------------
  const draftsEcole = [idEcoleManquant, doublonsEcole, classesIncoherentes, enseignantsNegatifs, elevesNegatifs, nomManquant, sansRegion, sansDepartement, sansCommune, sexeIncoherent, sallesInsuffisantes]
  const draftsEns = [idEnsManquant, doublonsEns, sansEcole, ecoleInconnue, dateInvalide, ancienneteIncoherente, sansNom]

  const toutes = [
    ...draftsEcole.map(d => finaliser(d, nbEcoles)),
    ...draftsEns.map(d => finaliser(d, nbEnseignants)),
  ].filter(i => i.count > 0)

  const detailScore: DataQualityReport['detailScore'] = toutes.map(i => ({
    label: `${i.count.toLocaleString('fr-FR')} ${i.label}`,
    points: -i.penalite,
  }))

  // Une colonne requise absente est un manque structurel, pas un défaut de ligne.
  const bloquantes = missingFields.filter(f => f.bloquant)
  for (const f of bloquantes) detailScore.push({ label: `Colonne requise absente : ${f.label}`, points: -12 })

  const penaliteTotale = toutes.reduce((a, i) => a + i.penalite, 0) + bloquantes.length * 12
  const score = Math.max(0, Math.round(100 - penaliteTotale))

  const errors = toutes.filter(i => i.severity === 'erreur')
  const warnings = toutes.filter(i => i.severity === 'avertissement')
  const invalidValues = toutes.filter(i =>
    ['classes_incoherentes', 'enseignants_negatifs', 'eleves_negatifs', 'date_invalide', 'anciennete_incoherente', 'repartition_sexe'].includes(i.code),
  )

  const ecolesInvalides = new Set<number>()
  for (const s of schools) {
    if (!s.id || s.nbClasses <= 0 || s.nbEnseignantsEtat < 0) ecolesInvalides.add(s.ligneSource)
  }
  const enseignantsInvalides = new Set<number>()
  for (const t of teachers) {
    if (!t.id || !t.idEtabAttache || !idsEcoles.has(t.idEtabAttache)) enseignantsInvalides.add(t.ligneSource)
  }

  return {
    score,
    appreciation: appreciation(score),
    errors,
    warnings,
    missingFields,
    duplicates,
    unknownSchools,
    invalidValues,
    territorialCompleteness,
    ecolesValides: nbEcoles - ecolesInvalides.size,
    ecolesLues: input.lignesEtablissements,
    enseignantsValides: nbEnseignants - enseignantsInvalides.size,
    enseignantsLus: input.lignesEnseignants,
    donneesElevesDisponibles,
    detailScore,
  }
}
