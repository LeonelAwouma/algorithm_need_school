/** Constructeurs d'entités de test, avec des valeurs neutres par défaut. */

import type { School, Teacher } from '../types/education'

export function ecole(partiel: Partial<School> & { id: string }): School {
  return {
    id: partiel.id,
    codeEcole: partiel.codeEcole ?? partiel.id,
    iaeb: partiel.iaeb ?? '',
    latitude: partiel.latitude ?? null,
    longitude: partiel.longitude ?? null,
    nom: partiel.nom ?? `École ${partiel.id}`,
    region: partiel.region ?? 'Centre',
    departement: partiel.departement ?? 'Mfoundi',
    commune: partiel.commune ?? 'Yaoundé I',
    zone: partiel.zone ?? 'urbaine',
    zoneBrute: partiel.zoneBrute ?? 'urbaine',
    typeEtab: partiel.typeEtab ?? 'EP',
    nbClasses: partiel.nbClasses ?? 6,
    nbSallesClasse: partiel.nbSallesClasse ?? null,
    sallesDoubleFlux: partiel.sallesDoubleFlux ?? null,
    niveauxOuverts: partiel.niveauxOuverts ?? null,
    departsConnusDeclares: partiel.departsConnusDeclares ?? null,
    sousSysteme: partiel.sousSysteme ?? null,
    zoneSecurite: partiel.zoneSecurite ?? null,
    accessibilite: partiel.accessibilite ?? null,
    estStructure: partiel.estStructure ?? false,
    nbEnseignantsEtat: partiel.nbEnseignantsEtat ?? 6,
    nbAutresEnseignants: partiel.nbAutresEnseignants ?? null,
    nbPostesOuvertsDeclares: partiel.nbPostesOuvertsDeclares ?? null,
    classesMultigrades: partiel.classesMultigrades ?? 0,
    classesMultigradesRenseignees: partiel.classesMultigradesRenseignees ?? false,
    prioriteLocale: partiel.prioriteLocale ?? 0,
    effectifTotalEleves: partiel.effectifTotalEleves ?? null,
    effectifFilles: partiel.effectifFilles ?? null,
    effectifGarcons: partiel.effectifGarcons ?? null,
    effectifParNiveau: partiel.effectifParNiveau ?? {},
    ligneSource: partiel.ligneSource ?? 2,
  }
}

export function enseignant(partiel: Partial<Teacher> & { id: string; idEtabAttache: string }): Teacher {
  return {
    id: partiel.id,
    nom: partiel.nom ?? `Nom${partiel.id}`,
    prenom: partiel.prenom ?? 'Prénom',
    dateNaissance: partiel.dateNaissance ?? new Date(Date.UTC(1985, 0, 1)),
    age: partiel.age ?? 40,
    idEtabAttache: partiel.idEtabAttache,
    communeAttache: partiel.communeAttache ?? 'Yaoundé I',
    departementAttache: partiel.departementAttache ?? 'Mfoundi',
    regionAttache: partiel.regionAttache ?? 'Centre',
    zoneAttache: partiel.zoneAttache ?? 'urbaine',
    iaebAttache: partiel.iaebAttache ?? '',
    ancienneteCarriereAns: partiel.ancienneteCarriereAns ?? 10,
    anciennetePosteAns: partiel.anciennetePosteAns ?? 5,
    situationFamiliale: partiel.situationFamiliale ?? 'marie',
    nbEnfants: partiel.nbEnfants ?? 2,
    formationContinue: partiel.formationContinue ?? 1,
    statut: partiel.statut ?? 'actif',
    payeParEtat: partiel.payeParEtat ?? true,
    sexe: partiel.sexe ?? '',
    categorie: partiel.categorie ?? '',
    fonction: partiel.fonction ?? '',
    sousSysteme: partiel.sousSysteme ?? null,
    voeux: partiel.voeux ?? [],
    motifDemande: partiel.motifDemande ?? null,
    ecoleMotif: partiel.ecoleMotif ?? null,
    anneesZoneNiveau1: partiel.anneesZoneNiveau1 ?? 0,
    anneesZoneNiveau2: partiel.anneesZoneNiveau2 ?? 0,
    rangTirage: partiel.rangTirage ?? null,
    ligneSource: partiel.ligneSource ?? 2,
  }
}

/** Crée `nombre` enseignants rattachés à une même école. */
export function enseignantsDe(ecoleId: string, nombre: number, partiel: Partial<Teacher> = {}): Teacher[] {
  return Array.from({ length: nombre }, (_, i) =>
    enseignant({ ...partiel, id: `${ecoleId}-T${i + 1}`, idEtabAttache: ecoleId, ancienneteCarriereAns: 20 - i }),
  )
}
