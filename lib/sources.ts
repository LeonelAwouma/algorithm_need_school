/**
 * Définition des quatre fichiers sources attendus par le moteur. Utilisée à
 * la fois côté client (import manuel) et côté serveur (import automatique
 * depuis data/sources/). Déposer un fichier de même nom dans data/sources/
 * suffit à le rendre disponible à l'import automatique — pas de code à changer.
 */
export type SlotId = 'classrooms' | 'personnel' | 'schools' | 'year5'

export interface SourceSlotDef {
  id: SlotId
  title: string
  filename: string
  worksheet: string
  headers: number
}

export const SOURCE_SLOTS: SourceSlotDef[] = [
  { id: 'classrooms', title: 'Salles de classes', filename: 'Base SALLES DE CLASSES_Ecoles_Primaire_2024_2025.xlsx', worksheet: 'PRIMAIRE', headers: 1 },
  { id: 'personnel', title: 'Personnel enseignant', filename: 'Base_Personnel_Primaire_Public_2021-2025.xlsx', worksheet: '2024-2025', headers: 1 },
  { id: 'schools', title: 'Recensement actuel', filename: 'Base Ecole primaire 2024_2025.xlsx', worksheet: '2024_2025', headers: 2 },
  { id: 'year5', title: 'Comparaison année 5', filename: 'Base de données des écoles_Année 5_2024.xlsx', worksheet: 'TEPP (2)', headers: 1 },
]
