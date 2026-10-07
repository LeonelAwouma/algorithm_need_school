/**
 * Vérifications systématiques exécutées après chaque simulation (§14).
 *
 * Ces contrôles ne corrigent rien : ils constatent. Un invariant en échec est
 * affiché tel quel dans l'application, parce qu'un résultat dont on ne peut pas
 * garantir la cohérence ne doit jamais être présenté comme exploitable.
 */

import type { SchoolDiagnostic } from '../../types/education'
import type { EngineSettings, InvariantCheck, SimulationResult } from '../../types/simulation'

function check(code: string, label: string, ok: boolean, detail: string): InvariantCheck {
  return { code, label, ok, detail }
}

export function verifierInvariants(
  resultat: SimulationResult,
  diagnostics: SchoolDiagnostic[],
  settings: EngineSettings,
  effectifsApres: Map<string, number>,
): InvariantCheck[] {
  const checks: InvariantCheck[] = []
  const { assignments } = resultat

  // 1 — Aucun enseignant affecté deux fois.
  const enseignants = new Set<string>()
  const enseignantsDoubles: string[] = []
  for (const a of assignments) {
    if (enseignants.has(a.teacherId)) enseignantsDoubles.push(a.teacherId)
    enseignants.add(a.teacherId)
  }
  checks.push(
    check(
      'un_enseignant_une_affectation',
      "Aucun enseignant n'apparaît dans deux affectations",
      enseignantsDoubles.length === 0,
      enseignantsDoubles.length === 0
        ? `${enseignants.size.toLocaleString('fr-FR')} enseignants distincts pour ${assignments.length.toLocaleString('fr-FR')} propositions.`
        : `Matricules concernés : ${enseignantsDoubles.slice(0, 5).join(', ')}.`,
    ),
  )

  // 2 — Aucun poste pourvu deux fois.
  const postes = new Set<string>()
  const postesDoubles: string[] = []
  for (const a of assignments) {
    if (postes.has(a.postId)) postesDoubles.push(a.postId)
    postes.add(a.postId)
  }
  checks.push(
    check(
      'un_poste_un_enseignant',
      "Aucun poste ne reçoit deux enseignants",
      postesDoubles.length === 0,
      postesDoubles.length === 0
        ? `${postes.size.toLocaleString('fr-FR')} postes distincts pourvus.`
        : `Postes concernés : ${postesDoubles.slice(0, 5).join(', ')}.`,
    ),
  )

  // 3 — Aucun départ supérieur à l'excédent autorisé.
  const departs = new Map<string, number>()
  for (const a of assignments) departs.set(a.schoolOrigineId, (departs.get(a.schoolOrigineId) ?? 0) + 1)
  const parEcole = new Map(diagnostics.map(d => [d.school.id, d]))
  const depassements: string[] = []
  for (const [schoolId, nb] of departs) {
    const d = parEcole.get(schoolId)
    if (!d || nb > d.excedentTheorique) depassements.push(`${schoolId} (${nb} départs pour ${d?.excedentTheorique ?? 0} autorisés)`)
  }
  checks.push(
    check(
      'departs_sous_excedent',
      "Aucune école ne perd plus d'enseignants que son excédent mobilisable",
      depassements.length === 0,
      depassements.length === 0
        ? `${departs.size.toLocaleString('fr-FR')} écoles sources, toutes dans la limite de leur excédent.`
        : depassements.slice(0, 5).join(' ; '),
    ),
  )

  // 4 — Aucune école source mise artificiellement en déficit.
  const misesEnDeficit: string[] = []
  for (const [schoolId] of departs) {
    const d = parEcole.get(schoolId)
    if (!d) continue
    const apres = effectifsApres.get(schoolId) ?? d.enseignantsEtat
    // Un départ n'est admis que dans la limite de l'excédent x = E − D : l'école garde sa dotation D.
    const besoinApres = Math.max(0, d.calcul.cible - apres)
    if (apres < Math.min(d.enseignantsEtat, d.calcul.dotation) || besoinApres > d.besoinTheorique) {
      misesEnDeficit.push(`${schoolId} (${apres} restants pour une dotation de ${d.calcul.dotation})`)
    }
  }
  checks.push(
    check(
      'pas_de_deficit_cree',
      "Aucune école source n'est mise en déficit par la simulation",
      misesEnDeficit.length === 0,
      misesEnDeficit.length === 0
        ? 'Chaque école source conserve au moins sa dotation théorique D.'
        : misesEnDeficit.slice(0, 5).join(' ; '),
    ),
  )

  // 5 — Chaque proposition a une origine légitime : demande recevable (vœux, hors vœux),
  // vivier des écoles excédentaires (obligatoire) ou décision de commission (arbitrage).
  const vivier = new Set(resultat.pool.teachers.map(p => p.teacher.id))
  const recevables = new Set(resultat.candidatures.filter(c => c.recevable).map(c => c.teacher.id))
  const illegitimes = assignments
    .filter(a => {
      if (a.arbitrageId) return false
      if (a.nature === 'obligatoire') return !vivier.has(a.teacherId)
      return !recevables.has(a.teacherId)
    })
    .map(a => a.teacherId)
  checks.push(
    check(
      'affectations_issues_du_vivier',
      'Chaque proposition provient d’une demande recevable, du vivier ou d’une commission',
      illegitimes.length === 0,
      illegitimes.length === 0
        ? 'Aucun enseignant non éligible ne figure dans les propositions.'
        : `Matricules concernés : ${illegitimes.slice(0, 5).join(', ')}.`,
    ),
  )

  // 6 — Conservation du besoin : besoin initial = postes couverts + besoin résiduel.
  const somme = resultat.postesCouverts + resultat.besoinResiduel
  checks.push(
    check(
      'conservation_du_besoin',
      'Besoin initial = postes couverts + postes restant à pourvoir',
      somme === resultat.besoinInitial,
      `${resultat.besoinInitial.toLocaleString('fr-FR')} = ${resultat.postesCouverts.toLocaleString('fr-FR')} + ${resultat.besoinResiduel.toLocaleString('fr-FR')}.`,
    ),
  )

  // 7 — Respect du périmètre géographique du scénario.
  const memeLibelle = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase()
  const horsPerimetre = assignments.filter(a => {
    if (a.arbitrageId) return false
    if (resultat.scope === 'commune') return !memeLibelle(a.communeOrigine, a.communeDestination)
    if (resultat.scope === 'departement') return !memeLibelle(a.departementOrigine, a.departementDestination)
    return false
  })
  checks.push(
    check(
      'respect_du_perimetre',
      'Tous les mouvements respectent le périmètre du scénario',
      horsPerimetre.length === 0,
      horsPerimetre.length === 0
        ? 'Aucun mouvement ne sort du périmètre géographique retenu.'
        : `${horsPerimetre.length.toLocaleString('fr-FR')} mouvements hors périmètre.`,
    ),
  )

  // 8 — Aucun mouvement interne à une même école.
  const internes = assignments.filter(a => a.schoolOrigineId === a.schoolDestinationId)
  checks.push(
    check(
      'pas_de_mouvement_interne',
      "Aucun enseignant n'est proposé sur un poste de sa propre école",
      internes.length === 0,
      internes.length === 0 ? 'Chaque proposition correspond à un mouvement réel.' : `${internes.length} mouvements internes détectés.`,
    ),
  )

  // 9 — Les redéploiements décidés par la DRH (fait de Prince) ne sont jamais remis en cause.
  const aPrince = new Set(resultat.faitsPrince.filter(e => e.statut === 'applique').map(e => e.fait.teacherId))
  const remisEnMouvement = assignments.filter(a => aPrince.has(a.teacherId)).map(a => a.teacherId)
  checks.push(
    check(
      'fait_prince_respecte',
      "Aucun enseignant redéployé par fait de Prince n'est remis en mouvement",
      remisEnMouvement.length === 0,
      remisEnMouvement.length === 0
        ? aPrince.size === 0
          ? "Aucun fait de Prince n'a été appliqué."
          : `${aPrince.size.toLocaleString('fr-FR')} décision(s) de la DRH respectée(s) : ces enseignants ne figurent dans aucune proposition.`
        : `Matricules concernés : ${remisEnMouvement.slice(0, 5).join(', ')}.`,
    ),
  )

  // 10 — Sous-systèmes : aucun poste n'est proposé hors du sous-système de l'enseignant (§1.2.3).
  const postesParEcole = new Map(resultat.postes.map(p => [p.schoolId, p]))
  const horsSousSysteme = assignments.filter(a => {
    if (a.arbitrageId) return false
    const p = postesParEcole.get(a.schoolDestinationId)
    return !!p && a.sousSysteme != null && p.sousSysteme != null && p.sousSysteme !== a.sousSysteme
  })
  checks.push(
    check(
      'sous_systeme_respecte',
      "Aucun enseignant n'est affecté hors de son sous-système",
      horsSousSysteme.length === 0,
      horsSousSysteme.length === 0
        ? 'Francophones et anglophones sont traités séparément ; seule une commission peut décider un changement.'
        : `${horsSousSysteme.length} mouvement(s) hors sous-système.`,
    ),
  )

  // 11 — Règle de la zone rouge : ni proposition hors vœux ni transfert imposé (§3.5).
  const imposesZoneRouge = settings.mobilite.regleZoneRouge
    ? assignments.filter(a => (a.nature === 'hors_voeux' || a.nature === 'obligatoire') && postesParEcole.get(a.schoolDestinationId)?.priorite.zoneRouge)
    : []
  checks.push(
    check(
      'zone_rouge',
      "Aucun poste en zone rouge n'est imposé ni proposé hors vœux",
      imposesZoneRouge.length === 0,
      !settings.mobilite.regleZoneRouge
        ? 'Règle de la zone rouge désactivée dans les paramètres.'
        : imposesZoneRouge.length === 0
          ? 'Les postes en zone rouge ne sont pourvus que par des volontaires ou par le recrutement.'
          : `${imposesZoneRouge.length} mouvement(s) imposé(s) en zone rouge.`,
    ),
  )

  return checks
}

/** `true` si tous les invariants sont respectés. */
export function tousInvariantsOk(checks: InvariantCheck[]): boolean {
  return checks.every(c => c.ok)
}
