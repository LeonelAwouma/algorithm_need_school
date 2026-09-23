/**
 * Fait de Prince : application des décisions de la DRH aux données.
 *
 * Un fait de Prince n'est pas simulé, il est acté. Il est appliqué AVANT tout
 * calcul, sur une copie des données : le jeu importé n'est jamais modifié, et
 * annuler une décision revient simplement à la retirer de la liste.
 *
 * Ce qui change quand une décision est appliquée :
 *   — l'enseignant est rattaché à l'école de destination (commune, département,
 *     région et zone comprises) et marqué `faitPrinceId` : il est alors exclu du
 *     vivier et ne peut plus jamais être proposé par l'algorithme ;
 *   — l'effectif d'enseignants payés par l'État baisse d'une unité à l'école
 *     d'origine et augmente d'une unité à l'école de destination (uniquement si
 *     l'enseignant est payé par l'État : sinon il n'entre pas dans cet effectif) ;
 *   — le nombre de postes ouverts déclarés de l'école de destination baisse d'une
 *     unité : le poste est pourvu.
 *
 * Le diagnostic (besoins, excédents, sévérité) et la simulation sont ensuite
 * calculés sur ces données corrigées : c'est ainsi que l'algorithme « tient
 * compte » de la décision.
 *
 * Aucun des contrôles de l'algorithme n'est appliqué (ancienneté, âge, statut,
 * besoin de la destination, excédent de l'origine, périmètre géographique) : la
 * décision de la DRH prime. Ces écarts sont seulement signalés, en observation,
 * avant validation.
 */

import type { School, SchoolDiagnostic, Teacher } from '../../types/education'
import type { Dataset, EngineSettings } from '../../types/simulation'
import type {
  FaitPrince,
  FaitPrinceApplique,
  ImpactEcolePrince,
  ImpactPrince,
  LieuPrince,
  StatutFaitPrince,
} from '../../types/prince'
import { besoinTheorique, excedentTheorique } from '../analytics/diagnostic'
import { estEligibleAdministrativement } from './pool'

export const LIBELLE_STATUT_PRINCE: Record<StatutFaitPrince, string> = {
  applique: 'Appliqué',
  enseignant_introuvable: 'Enseignant introuvable',
  ecole_introuvable: 'École introuvable',
  meme_ecole: 'Même école',
  doublon: 'Déjà redéployé',
}

export function lieuDe(ecole: School): LieuPrince {
  return { id: ecole.id, nom: ecole.nom, commune: ecole.commune, departement: ecole.departement, region: ecole.region }
}

let compteur = 0

/** Construit la décision à enregistrer. L'identifiant est local, sans générateur aléatoire. */
export function nouveauFaitPrince(
  enseignant: Teacher,
  origine: School | null,
  destination: School,
  reference: string,
  maintenant: Date = new Date(),
): FaitPrince {
  compteur++
  return {
    id: `prince-${compteur}-${maintenant.getTime().toString(36)}`,
    teacherId: enseignant.id,
    schoolDestinationId: destination.id,
    reference: reference.trim(),
    decideLe: maintenant.toISOString(),
    enseignant: `${enseignant.nom} ${enseignant.prenom}`.trim(),
    origine: origine
      ? lieuDe(origine)
      : { id: enseignant.idEtabAttache, nom: enseignant.idEtabAttache || 'École non renseignée', commune: enseignant.communeAttache, departement: enseignant.departementAttache, region: enseignant.regionAttache },
    destination: lieuDe(destination),
  }
}

/**
 * Applique les décisions au jeu de données. Renvoie un nouveau jeu (les tableaux
 * d'origine ne sont pas modifiés) et le sort de chaque décision.
 *
 * Les décisions sont traitées dans l'ordre chronologique. Un enseignant ne peut
 * faire l'objet que d'une décision : les suivantes sont écartées comme doublons.
 * Une décision qui vise un enseignant ou une école absents des données actuelles
 * est conservée dans la liste, mais sans effet.
 */
export function appliquerFaitsPrince(dataset: Dataset, faits: FaitPrince[]): { dataset: Dataset; appliques: FaitPrinceApplique[] } {
  if (faits.length === 0) return { dataset, appliques: [] }

  const enseignants = new Map<string, Teacher>()
  for (const t of dataset.teachers) if (!enseignants.has(t.id)) enseignants.set(t.id, t)
  const ecoles = new Map<string, School>()
  for (const s of dataset.schools) if (!ecoles.has(s.id)) ecoles.set(s.id, s)

  const ordre = [...faits].sort((a, b) => a.decideLe.localeCompare(b.decideLe) || a.id.localeCompare(b.id))
  const enseignantsModifies = new Map<Teacher, Teacher>()
  const ecolesModifiees = new Map<School, School>()
  const deplaces = new Set<string>()
  const appliques: FaitPrinceApplique[] = []

  const refuser = (fait: FaitPrince, statut: StatutFaitPrince, motif: string) => appliques.push({ fait, statut, motif })

  // Copie sur écriture : une école modifiée par plusieurs décisions n'est copiée qu'une fois.
  const modifierEcole = (ecole: School, maj: (s: School) => School) => {
    const courante = ecolesModifiees.get(ecole) ?? ecole
    ecolesModifiees.set(ecole, maj(courante))
  }

  for (const fait of ordre) {
    const enseignant = enseignants.get(fait.teacherId)
    if (!enseignant) {
      refuser(fait, 'enseignant_introuvable', "Ce matricule n'existe pas dans les données actuellement chargées.")
      continue
    }
    const destination = ecoles.get(fait.schoolDestinationId)
    if (!destination) {
      refuser(fait, 'ecole_introuvable', "L'école de destination n'existe pas dans les données actuellement chargées.")
      continue
    }
    if (deplaces.has(enseignant.id)) {
      refuser(fait, 'doublon', 'Cet enseignant a déjà fait l’objet d’une décision antérieure : celle-ci est ignorée.')
      continue
    }
    const origine = ecoles.get(enseignant.idEtabAttache) ?? null
    if (origine && origine.id === destination.id) {
      refuser(fait, 'meme_ecole', "L'enseignant est déjà rattaché à l'école de destination.")
      continue
    }

    deplaces.add(enseignant.id)

    if (enseignant.payeParEtat) {
      if (origine) modifierEcole(origine, s => ({ ...s, nbEnseignantsEtat: Math.max(0, s.nbEnseignantsEtat - 1) }))
      modifierEcole(destination, s => ({
        ...s,
        nbEnseignantsEtat: s.nbEnseignantsEtat + 1,
        // Le poste est pourvu : un poste déclaré de moins à pourvoir.
        nbPostesOuvertsDeclares: s.nbPostesOuvertsDeclares == null ? null : Math.max(0, s.nbPostesOuvertsDeclares - 1),
      }))
    }

    enseignantsModifies.set(enseignant, {
      ...enseignant,
      idEtabAttache: destination.id,
      communeAttache: destination.commune,
      departementAttache: destination.departement,
      regionAttache: destination.region,
      zoneAttache: destination.zone,
      faitPrinceId: fait.id,
    })
    appliques.push({ fait, statut: 'applique', motif: 'Décision appliquée : l’enseignant est rattaché à sa nouvelle école.' })
  }

  return {
    dataset: {
      ...dataset,
      schools: dataset.schools.map(s => ecolesModifiees.get(s) ?? s),
      teachers: dataset.teachers.map(t => enseignantsModifies.get(t) ?? t),
    },
    appliques,
  }
}

/**
 * Vérifie qu'une décision peut être enregistrée. Seules les impossibilités
 * matérielles sont refusées ; rien de ce que l'algorithme contrôle ne l'est.
 */
export function verifierFaitPrince(
  enseignant: Teacher | null,
  destination: SchoolDiagnostic | null,
  faitsExistants: FaitPrince[],
): { ok: true } | { ok: false; motif: string } {
  if (!enseignant) return { ok: false, motif: 'Choisissez l’enseignant à redéployer.' }
  if (!destination) return { ok: false, motif: 'Choisissez l’école de destination.' }
  const existant = faitsExistants.find(e => e.teacherId === enseignant.id)
  if (existant) {
    return {
      ok: false,
      motif: `Cet enseignant a déjà été redéployé par fait de Prince vers « ${existant.destination.nom} ». Annulez cette décision avant d’en enregistrer une nouvelle.`,
    }
  }
  if (enseignant.idEtabAttache === destination.school.id) {
    return { ok: false, motif: 'L’enseignant est déjà rattaché à cette école.' }
  }
  return { ok: true }
}

function impactEcole(ecole: School, delta: number, settings: EngineSettings): ImpactEcolePrince {
  const apres: School = { ...ecole, nbEnseignantsEtat: Math.max(0, ecole.nbEnseignantsEtat + delta) }
  return {
    nom: ecole.nom,
    effectifAvant: ecole.nbEnseignantsEtat,
    effectifApres: apres.nbEnseignantsEtat,
    besoinAvant: besoinTheorique(ecole, settings),
    besoinApres: besoinTheorique(apres, settings),
    excedentAvant: excedentTheorique(ecole, settings),
    excedentApres: excedentTheorique(apres, settings),
  }
}

/**
 * Conséquences prévisibles d'une décision sur les deux écoles, et observations
 * sur ce que l'algorithme aurait fait autrement. Purement informatif : rien ici
 * n'empêche la décision.
 */
export function simulerImpactPrince(
  enseignant: Teacher,
  origine: SchoolDiagnostic | null,
  destination: SchoolDiagnostic,
  settings: EngineSettings,
): ImpactPrince {
  const compte = enseignant.payeParEtat ? 1 : 0
  const impactOrigine = origine ? impactEcole(origine.school, -compte, settings) : null
  const impactDestination = impactEcole(destination.school, compte, settings)
  const observations: string[] = []

  if (!enseignant.payeParEtat) {
    observations.push("Cet enseignant n'est pas payé par l'État : les effectifs comptabilisés des écoles ne changent pas.")
  }

  const eligibilite = estEligibleAdministrativement(enseignant, settings)
  if (!eligibilite.ok) {
    observations.push(`L'algorithme n'aurait pas mobilisé cet enseignant : ${eligibilite.label ?? 'non éligible'}.`)
  }

  if (origine) {
    if (origine.excedentTheorique <= 0) {
      observations.push("L'école d'origine n'a aucun excédent mobilisable : l'algorithme n'aurait pas retenu ce départ.")
    }
    if (impactOrigine && impactOrigine.besoinApres > impactOrigine.besoinAvant) {
      const cree = impactOrigine.besoinApres - impactOrigine.besoinAvant
      observations.push(`Ce départ met l'école d'origine en déficit de ${cree} poste${cree > 1 ? 's' : ''} supplémentaire${cree > 1 ? 's' : ''}.`)
    }
  } else {
    observations.push("L'école de rattachement actuelle de cet enseignant est absente du fichier des établissements : seule l'école de destination est mise à jour.")
  }

  if (destination.besoinTheorique <= 0) {
    observations.push("L'école de destination n'est pas en déficit : l'algorithme n'y aurait proposé personne.")
  } else if (impactDestination.besoinApres < impactDestination.besoinAvant) {
    observations.push(`Ce redéploiement comble un poste sur les ${destination.besoinTheorique} qui manquaient à l'école de destination.`)
  }

  return { origine: impactOrigine, destination: impactDestination, observations }
}
