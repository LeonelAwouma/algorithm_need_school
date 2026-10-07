/**
 * Import en lot des décisions « Fait de Prince » (une ligne par décision).
 *
 * Colonnes reconnues : matricule de l'enseignant (« id_ens », « matricule »,
 * « Matricule_Enseignant »), école de destination (« id_etab », « ecole »,
 * « Identifiant_Ecole ») et, facultativement, le motif ou la référence de la
 * décision. Les lignes dont l'enseignant ou l'école sont introuvables sont
 * signalées, jamais devinées.
 */

import type { SchoolDiagnostic, Teacher } from '../../types/education'
import { lower, normalizeKey, recordsFromRows, text } from './normalize'

const ALIAS = {
  enseignant: ['id_ens', 'matricule', 'matricule_enseignant', 'matricule_ens', 'enseignant', 'id_enseignant'],
  ecole: ['id_etab', 'ecole', 'identifiant_ecole', 'code_ecole', 'code_etab', 'ecole_destination', 'etablissement'],
  reference: ['motif', 'reference', 'motif_officiel', 'decision', 'note_de_service', 'observation'],
}

export interface LignePrince {
  ligne: number
  enseignant: Teacher | null
  destination: SchoolDiagnostic | null
  reference: string
  erreur: string | null
}

export function analyserFichierPrince(rows: unknown[][], teachers: Teacher[], ecoles: SchoolDiagnostic[]): { lignes: LignePrince[]; manquantes: string[] } {
  const { headers, records } = recordsFromRows(rows)
  const cles = headers.map(h => normalizeKey(h))
  const colonne = (alias: string[]) => {
    const i = cles.findIndex(k => alias.map(a => normalizeKey(a)).includes(k))
    return i >= 0 ? headers[i] : null
  }
  const colEns = colonne(ALIAS.enseignant)
  const colEcole = colonne(ALIAS.ecole)
  const colRef = colonne(ALIAS.reference)
  const manquantes = [!colEns ? "matricule de l'enseignant" : null, !colEcole ? "école de destination" : null].filter((x): x is string => !!x)
  if (manquantes.length > 0) return { lignes: [], manquantes }

  const parMatricule = new Map(teachers.map(t => [lower(t.id), t]))
  const lignes: LignePrince[] = records.map(r => {
    const matricule = text(r.values[colEns as string])
    const code = text(r.values[colEcole as string])
    const enseignant = parMatricule.get(lower(matricule)) ?? null
    // École bilingue : la section du sous-système de l'enseignant.
    const candidates = ecoles.filter(d => lower(d.school.id) === lower(code) || lower(d.school.codeEcole) === lower(code))
    const destination = candidates.find(d => !enseignant?.sousSysteme || d.school.sousSysteme === enseignant.sousSysteme) ?? candidates[0] ?? null
    const erreur = !enseignant ? `enseignant « ${matricule} » introuvable` : !destination ? `école « ${code} » introuvable` : null
    return { ligne: r.ligne, enseignant, destination, reference: colRef ? text(r.values[colRef]) : '', erreur }
  })
  return { lignes, manquantes }
}
