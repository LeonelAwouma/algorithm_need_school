'use client'

/**
 * Fournisseurs communs à toute l'application : cache des requêtes vers l'API,
 * puis session d'interface, qui en dépend pour rouvrir le dernier jeu.
 */

import type { ReactNode } from 'react'

import { FournisseurRequetes } from '@shared/requetes'
import { SessionProvider } from '@shared/session'

export function Fournisseurs({ children }: { children: ReactNode }) {
  return (
    <FournisseurRequetes>
      <SessionProvider>{children}</SessionProvider>
    </FournisseurRequetes>
  )
}
