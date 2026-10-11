/**
 * Configuration ESLint (flat config, Next 16 : `next lint` n'existe plus).
 *
 * En plus des règles de Next et de TypeScript, ce fichier fait respecter les
 * frontières de l'architecture en contextes délimités (DDD) :
 *
 *   contextes/<contexte>/domain          types et règles d'affichage, sans React ni réseau
 *   contextes/<contexte>/infrastructure  appels HTTP, une fonction par route
 *   contextes/<contexte>/application     hooks de requête et de mutation
 *   contextes/<contexte>/ui              pages et composants, qui passent par application/
 *
 * Les couches sans React (domain, infrastructure, shared/api, shared/kernel)
 * n'utilisent que des imports relatifs : elles sont compilées et testées sous
 * Node, où l'alias `@/` n'est pas résolu.
 */

import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

/** Interdit tout import du moteur de référence, conservé hors du frontend pour le portage Python. */
const SANS_MOTEUR_REFERENCE = {
  group: ['**/moteur-reference/**'],
  message: 'Le frontend ne calcule rien : passez par l’API (src/contextes/*/infrastructure).',
}

/** Un contexte n'est visible des autres que par son index public. */
const SANS_IMPORT_PROFOND = {
  group: ['@/src/contextes/*/*', '@/src/contextes/*/*/**'],
  message: 'Importez un autre contexte par son index public : @/src/contextes/<contexte>.',
}

/** Les couches testées sous Node ne peuvent pas utiliser l'alias `@/`. */
const SANS_ALIAS = {
  group: ['@/*'],
  message: 'Cette couche est testée sous Node : utilisez un import relatif.',
}

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': ['error', { patterns: [SANS_MOTEUR_REFERENCE, SANS_IMPORT_PROFOND] }],
    },
  },

  // Domaine : ni React, ni réseau, ni alias.
  {
    files: ['src/contextes/*/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react', message: 'Le domaine ne dépend pas de React.' }],
          patterns: [
            SANS_MOTEUR_REFERENCE,
            SANS_ALIAS,
            {
              group: ['**/infrastructure/**', '**/application/**', '**/ui/**'],
              message: 'Le domaine ne dépend d’aucune autre couche.',
            },
            { group: ['**/shared/api/client'], message: 'Le domaine ne fait pas d’appel réseau.' },
          ],
        },
      ],
    },
  },

  // Infrastructure, client API et noyau partagé : testés sous Node.
  {
    files: ['src/contextes/*/infrastructure/**/*.ts', 'src/shared/api/**/*.ts', 'src/shared/kernel/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'react', message: 'Cette couche ne dépend pas de React.' }],
          patterns: [SANS_MOTEUR_REFERENCE, SANS_ALIAS],
        },
      ],
    },
  },

  // Interface : passe par les hooks de la couche application.
  {
    files: ['src/contextes/*/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            SANS_MOTEUR_REFERENCE,
            SANS_IMPORT_PROFOND,
            { group: ['**/infrastructure/**'], message: 'L’interface passe par les hooks de application/.' },
          ],
        },
      ],
    },
  },

  // Doit rester en dernier : désactive les règles de style gérées par Prettier.
  prettier,

  globalIgnores(['.next/**', 'out/**', 'build/**', '.test-build/**', 'next-env.d.ts', 'public/mockServiceWorker.js']),
])
