'use client'

/**
 * Point d'entrée de l'application.
 *
 * L'application est une page unique à navigation interne : la version de
 * bureau sert un export statique, sans serveur Next.js. Les données et les
 * calculs sont ceux du serveur AlgoPlanR (API Django) ; la page affichée et les
 * filtres sont l'état de la session d'interface (`src/shared/session`).
 */

import type { SessionAcces } from '@contextes/acces'
// ACCÈS DÉSACTIVÉ — voir la note au-dessus de `Page`.
// import { useAcces } from '@contextes/acces'
// import { EcranConnexion } from '@contextes/acces/pages'
import { Application } from '@/src/racine/Application'

/**
 * ACCÈS DÉSACTIVÉ (AlgoPlanR 1.0.0) : la plateforme s'ouvre directement, sans
 * écran de connexion, avec les droits complets (ceux du DRH). La gestion des
 * accès des délégués régionaux est retirée du menu.
 *
 * Le code du contrôle d'accès est conservé (src/contextes/acces) : pour le
 * rétablir, décommenter les blocs marqués « ACCÈS DÉSACTIVÉ » dans ce fichier,
 * dans src/racine et dans src/shared/ui/coquille, puis supprimer `SESSION_DIRECTE`.
 * Le périmètre d'un délégué devra alors être imposé par le serveur, qui seul
 * filtre les données.
 */
const SESSION_DIRECTE: SessionAcces = { role: 'drh' }

export default function Page() {
  // const acces = useAcces()
  // if (!acces.session) return <EcranConnexion acces={acces} />
  // return <Application utilisateur={acces.session} />
  return <Application utilisateur={SESSION_DIRECTE} />
}
