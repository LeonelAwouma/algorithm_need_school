# Planification des enseignants

Application d'affectation séquentielle des enseignants du primaire public, à partir de deux fichiers (établissements, enseignants). Elle calcule un barème individuel par enseignant, un score enseignant-poste, et propose des affectations en plusieurs phases (commune, département, règles ciblées, puis reste).

⚠️ **Ceci est un outil de simulation.** Les propositions d'affectation sont des estimations basées sur un barème configurable — pas des mutations administrativement approuvées ni un quota de recrutement officiel. Voir la page *Méthodologie* de l'application pour le détail des règles et de leurs limites.

## Fonctionnalités

- **Import manuel** des deux fichiers sources (établissements, enseignants) via le sélecteur de fichiers du navigateur
- **Paramètres de l'algorithme** : seuils, poids du barème individuel et du score de poste, phases DREB activables, import/export de configuration JSON
- **Tableau de bord** avec la synthèse chiffrée (besoin total, disponibles, affectés, non affectés, postes non pourvus, à recruter)
- **Écoles en besoin** : établissements avec des postes ouverts et leur taux d'encadrement
- **Écoles fournisseurs** : origine des enseignants du vivier, par commune
- **Affectations proposées** : la liste concrète des affectations calculées, avec le score retenu
- **Enseignants non affectés** et **Postes non pourvus** : ce qui reste après toutes les phases
- **Vivier potentiel** : tous les enseignants éligibles, avec leur barème et leur statut
- **Méthodologie** : explication en langage simple des indicateurs et des règles précises du moteur, exportable en Word (.docx)
- **Export Excel** : rapport complet multi-feuilles (synthèse, écoles, affectations, vivier…)

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
