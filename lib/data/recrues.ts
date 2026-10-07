/**
 * Lecture du fichier des candidats au concours (nouveaux recrutés, référentiel §3.8).
 *
 * Fichier facultatif, importé à part : une ligne par candidat admis, avec sa note
 * d'admission, le sous-système de son concours, sa commune de résidence et ses
 * trois choix d'écoles. Comme les autres fichiers, il est lu sur le poste, sans
 * transmission.
 */

import type { Recrue } from '../../types/simulation'
import { normalizeKey, numOrNull, recordsFromRows, text } from './normalize'
import { parseSousSysteme } from './parse'

/** Colonnes attendues et noms acceptés (comparés sans accents, casse ni ponctuation). */
export const COLONNES_RECRUES: { champ: keyof Omit<Recrue, 'choix' | 'ligneSource'> | 'choix1' | 'choix2' | 'choix3'; label: string; requis: boolean; alias: string[] }[] = [
  { champ: 'id', label: 'Matricule ou numéro de candidat', requis: true, alias: ['matricule', 'id', 'numero', 'numero_candidat', 'num_candidat', 'code'] },
  { champ: 'nom', label: 'Nom et prénoms', requis: true, alias: ['nom', 'noms', 'nom_prenoms', 'noms_et_prenoms', 'candidat', 'nom_complet'] },
  { champ: 'note', label: "Note d'admission", requis: true, alias: ['note', 'note_obtenue', 'note_admission', 'moyenne', 'score'] },
  { champ: 'sousSysteme', label: 'Sous-système du concours', requis: false, alias: ['sous_systeme', 'langue', 'concours', 'sous_systeme_concours'] },
  { champ: 'sexe', label: 'Sexe', requis: false, alias: ['sexe', 'genre'] },
  { champ: 'communeResidence', label: 'Commune de résidence', requis: false, alias: ['commune', 'commune_residence', 'commune_choisie', 'residence'] },
  { champ: 'choix1', label: 'Choix 1 (code école)', requis: false, alias: ['choix_1', 'choix1', 'ecole_prioritaire', 'voeu_1', 'premier_choix'] },
  { champ: 'choix2', label: 'Choix 2', requis: false, alias: ['choix_2', 'choix2', '2e_ecole', 'deuxieme_ecole', 'voeu_2', 'deuxieme_choix'] },
  { champ: 'choix3', label: 'Choix 3', requis: false, alias: ['choix_3', 'choix3', '3e_ecole', 'troisieme_ecole', 'voeu_3', 'troisieme_choix'] },
]

export interface LectureRecrues {
  recrues: Recrue[]
  /** Colonnes indispensables introuvables. */
  manquantes: string[]
  /** Lignes écartées (sans identifiant ou sans note), avec leur motif. */
  ecartees: { ligne: number; motif: string }[]
}

export async function lireRecrues(file: File): Promise<LectureRecrues> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', dense: true })
  const feuille = workbook.SheetNames[0]
  if (!feuille) throw new Error(`Aucune feuille de calcul n'a été trouvée dans ${file.name}.`)
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[feuille], { header: 1, defval: null, raw: true }) as unknown[][]
  return analyserRecrues(rows)
}

/** Analyse les lignes d'un classeur déjà lu (première ligne : en-têtes). */
export function analyserRecrues(rows: unknown[][]): LectureRecrues {
  const { headers, records } = recordsFromRows(rows)
  const cles = headers.map(h => normalizeKey(h))
  const colonne = new Map<string, string>()
  for (const def of COLONNES_RECRUES) {
    const acceptes = new Set([def.champ, ...def.alias].map(a => normalizeKey(a)))
    const i = cles.findIndex(k => acceptes.has(k))
    if (i >= 0) colonne.set(def.champ, headers[i])
  }
  const manquantes = COLONNES_RECRUES.filter(d => d.requis && !colonne.has(d.champ)).map(d => d.label)
  if (manquantes.length > 0) return { recrues: [], manquantes, ecartees: [] }

  const lire = (values: Record<string, unknown>, champ: string) => {
    const enTete = colonne.get(champ)
    return enTete ? values[enTete] : null
  }

  const recrues: Recrue[] = []
  const ecartees: LectureRecrues['ecartees'] = []
  const vus = new Set<string>()
  for (const r of records) {
    const v = r.values
    const id = text(lire(v, 'id'))
    const note = numOrNull(lire(v, 'note'))
    if (!id) {
      ecartees.push({ ligne: r.ligne, motif: 'sans identifiant' })
      continue
    }
    if (note == null) {
      ecartees.push({ ligne: r.ligne, motif: "sans note d'admission" })
      continue
    }
    if (vus.has(id)) {
      ecartees.push({ ligne: r.ligne, motif: `identifiant ${id} en double` })
      continue
    }
    vus.add(id)
    recrues.push({
      id,
      nom: text(lire(v, 'nom')),
      sexe: text(lire(v, 'sexe')),
      sousSysteme: parseSousSysteme(lire(v, 'sousSysteme')),
      note,
      communeResidence: text(lire(v, 'communeResidence')),
      choix: ['choix1', 'choix2', 'choix3'].map(c => text(lire(v, c))).filter(c => c !== '' && c !== '—'),
      ligneSource: r.ligne,
    })
  }
  return { recrues, manquantes, ecartees }
}
