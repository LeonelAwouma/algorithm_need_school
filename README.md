# Planification des enseignants

Application de simulation des plans de rotation des enseignants du primaire public, à partir des fichiers officiels (salles de classe, personnel, effectifs scolaires). Elle calcule le besoin de couverture par école, identifie un vivier d'enseignants mobilisables et propose des rotations, en suivant la démarche définie avec la DRH.

⚠️ **Ceci est un outil de simulation.** Les résultats (besoins, vivier, rotations) sont des estimations basées sur des hypothèses explicites — pas des mutations administrativement approuvées ni un quota de recrutement officiel. Voir la page *Méthodologie* de l'application pour le détail des règles et de leurs limites.

## Fonctionnalités

- **Import automatique** des quatre fichiers sources depuis `data/sources/` (ou import manuel via le sélecteur de fichiers du navigateur)
- **Tableau de bord** avec les indicateurs clés (écoles publiques, écoles calculables, besoin initial, vivier potentiel)
- **Écoles et besoins** : liste des écoles publiques avec besoin de couverture, départs/arrivées proposés et filtres
- **Vivier potentiel** : enseignants mobilisables, avec ancienneté et destination proposée
- **Rotations proposées** : la liste concrète des mouvements simulés
- **Effectifs Année N / N+1** : pour une école donnée, l'effectif avant et après application des rotations
- **Analyse territoriale** : les mêmes indicateurs agrégés par région ou arrondissement
- **Contrôles des données** : anomalies détectées dans les fichiers sources (personnel absent, salles incohérentes, écarts…)
- **Méthodologie** : explication en langage simple des indicateurs et des règles précises du moteur, exportable en Word (.docx)

## Stack technique

- [Next.js 16](https://nextjs.org/) (App Router) + React 19 + TypeScript
- Tailwind CSS
- [SheetJS (`xlsx`)](https://sheetjs.com/) pour la lecture des classeurs Excel
- [`docx`](https://docx.js.org/) pour l'export Word
- Aucune base de données : tout est calculé à la volée, à partir des fichiers sources

## Démarrage

```bash
pnpm install
pnpm dev
