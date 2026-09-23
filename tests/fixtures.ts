/** Constructeurs d'entités de test, avec des valeurs neutres par défaut. */

import type { School, Teacher } from '../types/education'

export function ecole(partiel: Partial<School> & { id: string }): School {
  return {
    id: partiel.id,
    nom: partiel.nom ?? `École ${partiel.id}`,
    region: partiel.region ?? 'Centre',
    departement: partiel.departement ?? 'Mfoundi',
    commune: partiel.commune ?? 'Yaoundé I',
    zone: partiel.zone ?? 'urbaine',
    zoneBrute: partiel.zoneBrute ?? 'urbaine',
    typeEtab: partiel.typeEtab ?? 'EP',
    nbClasses: partiel.nbClasses ?? 6,
    nbSallesClasse: partiel.nbSallesClasse ?? null,
    nbEnseignantsEtat: partiel.nbEnseignantsEtat ?? 6,
    nbAutresEnseignants: partiel.nbAutresEnseignants ?? null,
    nbPostesOuvertsDeclares: partiel.nbPostesOuvertsDeclares ?? null,
    classesMultigrades: partiel.classesMultigrades ?? 0,
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
    ancienneteCarriereAns: partiel.ancienneteCarriereAns ?? 10,
    anciennetePosteAns: partiel.anciennetePosteAns ?? 5,
    situationFamiliale: partiel.situationFamiliale ?? 'marie',
    nbEnfants: partiel.nbEnfants ?? 2,
    formationContinue: partiel.formationContinue ?? 1,
    statut: partiel.statut ?? 'actif',
    payeParEtat: partiel.payeParEtat ?? true,
    ligneSource: partiel.ligneSource ?? 2,
  }
}

/** Crée `nombre` enseignants rattachés à une même école. */
export function enseignantsDe(ecoleId: string, nombre: number, partiel: Partial<Teacher> = {}): Teacher[] {
  return Array.from({ length: nombre }, (_, i) =>
    enseignant({ ...partiel, id: `${ecoleId}-T${i + 1}`, idEtabAttache: ecoleId, ancienneteCarriereAns: 20 - i }),
  )
}
