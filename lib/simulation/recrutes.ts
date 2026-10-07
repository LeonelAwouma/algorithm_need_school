/**
 * Déploiement des nouveaux recrutés (référentiel §3.8).
 *
 * Les nouveaux recrutés ne sont déployés que sur les postes restés vacants après
 * le redéploiement. Les candidats sont classés par note d'admission, de la plus
 * élevée à la plus faible : le mieux classé choisit le premier — cas particulier
 * de l'acceptation différée où toutes les écoles classent les candidats de la
 * même façon. Pour chacun :
 *
 *   1. ses trois choix, dans l'ordre, s'ils sont disponibles ;
 *   2. sinon un poste disponible dans le département de sa commune de résidence ;
 *   3. sinon dans la région ;
 *   4. sinon le vivier national, pour arbitrage.
 *
 * Seuls les postes du sous-système de son concours lui sont proposés. À extension
 * égale, le poste le mieux placé sur la liste de priorité est retenu. Les postes
 * en zone rouge peuvent être pourvus par le recrutement (§3.5).
 */

import type { School } from '../../types/education'
import type { EngineSettings, Recrue, ResultatRecrutes, TeachingPost } from '../../types/simulation'
import { lower } from '../data/normalize'
import { IndexUnites, sousSystemesCompatibles } from './candidatures'

/** Ordre des candidats : note décroissante ; à note égale, la candidate d'abord si la règle est activée. */
export function classerRecrues(recrues: Recrue[], settings: EngineSettings): Recrue[] {
  const femme = (r: Recrue) => (/^f/i.test(r.sexe.trim()) ? 0 : 1)
  return [...recrues].sort((a, b) => {
    if (b.note !== a.note) return b.note - a.note
    if (settings.mobilite.departageFeminin && femme(a) !== femme(b)) return femme(a) - femme(b)
    return a.id.localeCompare(b.id)
  })
}

export function deployerRecrues(
  recrues: Recrue[],
  postesVacants: TeachingPost[],
  unites: IndexUnites,
  settings: EngineSettings,
): ResultatRecrutes {
  // Copie : les postes de la simulation de redéploiement ne sont pas modifiés.
  const libres = postesVacants.map(p => ({ ...p, pourvu: false }))
  const territoire = new Map<string, { departement: string; region: string }>()
  for (const u of unites.parId.values() as Iterable<School>) {
    const c = lower(u.commune)
    if (c && !territoire.has(c)) territoire.set(c, { departement: u.departement, region: u.region })
  }

  const resultat: ResultatRecrutes = { affectations: [], vivierNational: [], postesRestants: 0 }
  const prendre = (filtre: (p: TeachingPost) => boolean) => {
    const poste = libres.filter(p => !p.pourvu && filtre(p)).sort((a, b) => a.rang - b.rang)[0] ?? null
    if (poste) poste.pourvu = true
    return poste
  }

  for (const r of classerRecrues(recrues, settings)) {
    const compatible = (p: TeachingPost) => sousSystemesCompatibles(r.sousSysteme, p.sousSysteme)
    let issue: 'choix' | 'departement' | 'region' | null = null
    let rangChoix: number | null = null
    let poste: TeachingPost | null = null

    for (let i = 0; i < Math.min(3, r.choix.length) && !poste; i++) {
      const unite = unites.resoudre(r.choix[i], r.sousSysteme)
      if (!unite) continue
      poste = prendre(p => p.schoolId === unite.id && compatible(p))
      if (poste) {
        issue = 'choix'
        rangChoix = i + 1
      }
    }
    const lieu = territoire.get(lower(r.communeResidence))
    if (!poste && lieu) {
      poste = prendre(p => compatible(p) && lower(p.departement) === lower(lieu.departement))
      if (poste) issue = 'departement'
    }
    if (!poste && lieu) {
      poste = prendre(p => compatible(p) && lower(p.region) === lower(lieu.region))
      if (poste) issue = 'region'
    }

    if (poste && issue) {
      resultat.affectations.push({
        recrueId: r.id,
        nom: r.nom,
        note: r.note,
        schoolId: poste.schoolId,
        nomEtab: poste.nomEtab,
        commune: poste.commune,
        issue,
        rangChoix,
      })
    } else {
      resultat.vivierNational.push({
        recrueId: r.id,
        nom: r.nom,
        note: r.note,
        motif: lieu
          ? 'Aucun poste compatible disponible dans la région de résidence.'
          : 'Commune de résidence inconnue et aucun choix disponible.',
      })
    }
  }

  resultat.postesRestants = libres.filter(p => !p.pourvu).length
  return resultat
}
