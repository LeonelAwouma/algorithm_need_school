/**
 * Serveur de référence — vivier, postes ouverts, nominations, registre des
 * mouvements et journal d'audit initial.
 *
 * Le vivier réunit les deux sources confirmées par le mémo : les enseignants
 * excédentaires restés sans affectation dans le scénario retenu, et des
 * lauréats sans poste. Les postes ouverts sont les postes restés vacants. Une
 * poignée de nominations d'exemple couvre chaque statut, pour que le cycle de
 * vie soit visible dès l'ouverture des écrans.
 */

import { sousSystemesCompatibles, procheDeLaRetraite } from '../../lib/simulation/candidatures'
import { detaillerBareme, niveauProximite, scoreAppariement } from '../../lib/simulation/scoring'
import type { TeachingPost } from '../../types/simulation'
import type {
  EvenementAuditDetail,
  Mouvement,
  Nomination,
  PersonneVivier,
  PersonneVivierDetail,
  PosteCompatible,
  PosteOuvert,
  ProximityLevel,
  ScoreBreakdown,
  StatutNomination,
  TransitionNomination,
} from '../../../frontend/components/shared/api/contrat'
import { JEU, REFERENCE, SCENARIO_RETENU, scenarioDe, type Contexte } from './contexte'
import type { Catalogue } from './outils'

const F = 'nominations'
const AGENT = 'Agent de démonstration'

/** Horodatage d'exemple, quelques minutes après la date de référence. */
function le(minutes: number): string {
  return new Date(REFERENCE.getTime() + minutes * 60_000).toISOString()
}

function posteOuvert(p: TeachingPost): PosteOuvert {
  return {
    id: p.id,
    schoolId: p.schoolId,
    nomEtab: p.nomEtab,
    region: p.region,
    departement: p.departement,
    commune: p.commune,
    sousSysteme: p.sousSysteme,
    zoneSecurite: p.priorite.zoneSecurite,
    indicePriorite: p.priorite.indice,
    rang: p.rang,
    statut: 'libre',
    nominationId: null,
  }
}

/** Enregistre les routes et renvoie l'état initial des nominations et de l'audit. */
export function routesNominations(
  ctx: Contexte,
  catalogue: Catalogue,
  recrues: {
    id: string
    nom: string
    note: number
    sousSysteme: PersonneVivier['sousSysteme']
    communeResidence: string
  }[],
) {
  const base = `jeux/${JEU}`
  const { resultat } = scenarioDe(ctx, SCENARIO_RETENU)
  const postes = resultat.uncoveredPosts
  const postesOuverts = postes.map(posteOuvert)

  // --- Vivier : excédentaires sans affectation, puis lauréats sans poste. ---
  const vivier: PersonneVivier[] = []
  const rapprochements: Record<string, PosteCompatible[]> = {}
  const details = new Map<string, PersonneVivierDetail>()

  for (const p of resultat.unmatchedTeachers) {
    const t = p.teacher
    const ecole = ctx.diagnostic.bySchoolId[t.idEtabAttache]
    const contraintes: string[] = []
    if (procheDeLaRetraite(t, ctx.settings)) contraintes.push('Proche de la retraite : protégé des transferts imposés')
    if (!t.sousSysteme) contraintes.push('Sous-système non renseigné')
    const personne: PersonneVivier = {
      id: `ens-${t.id}`,
      matricule: t.id,
      nom: t.nom,
      prenom: t.prenom,
      source: 'excedentaire',
      sousSysteme: t.sousSysteme,
      region: t.regionAttache,
      departement: t.departementAttache,
      commune: t.communeAttache,
      ecoleOrigine: { id: p.ecoleOrigine.id, nom: p.ecoleOrigine.nom },
      bareme: p.bareme,
      note: null,
      disponibilite: 'libre',
      contraintes,
    }
    vivier.push(personne)
    details.set(personne.id, {
      ...personne,
      detailBareme: detaillerBareme(t, ctx.settings, ecole?.priorite.niveauDifficulte ?? null),
      historique: [],
    })
    rapprochements[personne.id] = postes
      .map(poste => {
        const compatible = sousSystemesCompatibles(t.sousSysteme, poste.sousSysteme)
        const motifs: string[] = []
        if (!compatible) motifs.push('Sous-système du poste différent de celui de l’enseignant')
        if (poste.priorite.zoneRouge) motifs.push('Poste en zone rouge : volontariat requis')
        return {
          poste: posteOuvert(poste),
          score: scoreAppariement(t, p.bareme, poste, ctx.settings, null),
          proximite: niveauProximite(t, poste),
          compatible: compatible && !poste.priorite.zoneRouge,
          motifs,
        }
      })
      .sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.score.total - a.score.total)
  }

  for (const r of recrues) {
    const ecoleCommune = ctx.dataset.schools.find(s => s.commune === r.communeResidence)
    const personne: PersonneVivier = {
      id: `laureat-${r.id}`,
      matricule: null,
      nom: r.nom,
      prenom: '',
      source: 'laureat_sans_poste',
      sousSysteme: r.sousSysteme,
      region: ecoleCommune?.region ?? '',
      departement: ecoleCommune?.departement ?? '',
      commune: r.communeResidence,
      ecoleOrigine: null,
      bareme: null,
      note: r.note,
      disponibilite: 'libre',
      contraintes: ['Lauréat : première affectation'],
    }
    vivier.push(personne)
    details.set(personne.id, { ...personne, detailBareme: null, historique: [] })
    rapprochements[personne.id] = postes
      .map(poste => {
        const proximite: ProximityLevel =
          poste.commune === personne.commune
            ? 'meme_commune'
            : poste.departement === personne.departement
              ? 'meme_departement'
              : poste.region === personne.region
                ? 'meme_region'
                : 'hors_region'
        const score: ScoreBreakdown = {
          total: r.note,
          components: [{ label: 'Note d’admission', valeur: r.note, poids: 1, contribution: r.note }],
        }
        const compatible = sousSystemesCompatibles(r.sousSysteme, poste.sousSysteme)
        return {
          poste: posteOuvert(poste),
          score,
          proximite,
          compatible,
          motifs: compatible ? [] : ['Sous-système du poste différent de celui du lauréat'],
        }
      })
      .sort((a, b) => Number(b.compatible) - Number(a.compatible) || b.score.total - a.score.total)
  }

  // --- Nominations d'exemple : une ou deux par statut, chacune sur un poste distinct. ---
  const statuts: StatutNomination[] = ['proposee', 'proposee', 'validee', 'validee', 'mise_en_oeuvre', 'rejetee']
  const nominations: Nomination[] = []
  const postesPris = new Set<string>()
  const audit: EvenementAuditDetail[] = [
    {
      id: 'audit-1',
      type: 'import',
      action: 'création',
      objet: { type: 'jeu', id: JEU },
      resume: 'Ouverture du jeu de démonstration',
      auteur: AGENT,
      le: le(0),
      avant: null,
      apres: { etablissements: ctx.dataset.schools.length, enseignants: ctx.dataset.teachers.length },
    },
    {
      id: 'audit-2',
      type: 'scenario_retenu',
      action: 'retenu',
      objet: { type: 'scenario', id: SCENARIO_RETENU },
      resume: 'Scénario départemental retenu pour la planification',
      auteur: AGENT,
      le: le(5),
      avant: null,
      apres: { scenario: SCENARIO_RETENU },
    },
    {
      id: 'audit-3',
      type: 'recalcul',
      action: 'version 1',
      objet: null,
      resume: 'Calcul de la planification sur cinq ans (version 1)',
      auteur: null,
      le: le(6),
      avant: null,
      apres: { version: 1 },
    },
  ]

  for (const personne of vivier) {
    if (nominations.length >= statuts.length) break
    const choix = rapprochements[personne.id].find(c => c.compatible && !postesPris.has(c.poste.id))
    if (!choix) continue
    postesPris.add(choix.poste.id)
    const statut = statuts[nominations.length]
    const id = `nom-${nominations.length + 1}`
    const t0 = 10 + nominations.length * 10
    const historique: TransitionNomination[] = [
      {
        de: null,
        vers: 'proposee',
        le: le(t0),
        auteur: AGENT,
        motif: 'Meilleur rapprochement du vivier',
        reference: null,
      },
    ]
    if (statut === 'validee' || statut === 'mise_en_oeuvre') {
      historique.push({
        de: 'proposee',
        vers: 'validee',
        le: le(t0 + 2),
        auteur: AGENT,
        motif: null,
        reference: `DEC-2026-${id}`,
      })
    }
    if (statut === 'mise_en_oeuvre') {
      historique.push({
        de: 'validee',
        vers: 'mise_en_oeuvre',
        le: le(t0 + 4),
        auteur: AGENT,
        motif: null,
        reference: `ACTE-2026-${id}`,
      })
    }
    if (statut === 'rejetee') {
      historique.push({
        de: 'proposee',
        vers: 'rejetee',
        le: le(t0 + 3),
        auteur: AGENT,
        motif: 'Contrainte familiale signalée',
        reference: null,
      })
    }

    const occupe = statut === 'validee' || statut === 'mise_en_oeuvre'
    const poste: PosteOuvert = {
      ...choix.poste,
      statut: statut === 'mise_en_oeuvre' ? 'pourvu' : occupe ? 'reserve' : 'libre',
      nominationId: statut === 'rejetee' ? null : id,
    }
    const disponibilite: PersonneVivier['disponibilite'] =
      statut === 'proposee' ? 'proposee' : occupe ? 'nommee' : 'libre'
    personne.disponibilite = disponibilite
    const ouvert = postesOuverts.find(p => p.id === poste.id)
    if (ouvert) Object.assign(ouvert, { statut: poste.statut, nominationId: poste.nominationId })

    const nomination: Nomination = {
      id,
      personne: { ...personne },
      poste,
      annee: 'N+1',
      statut,
      origine: 'automatique',
      motif: 'Meilleur rapprochement du vivier',
      referenceDecision: occupe ? `DEC-2026-${id}` : null,
      referenceActe: statut === 'mise_en_oeuvre' ? `ACTE-2026-${id}` : null,
      dateEffet: statut === 'mise_en_oeuvre' ? le(t0 + 4) : null,
      creeeLe: le(t0),
      historique,
    }
    nominations.push(nomination)
    const detail = details.get(personne.id)
    if (detail) Object.assign(detail, { disponibilite, historique: [nomination] })

    historique.forEach((h, i) =>
      audit.push({
        id: `audit-${audit.length + 1}`,
        type: 'nomination',
        action: h.vers,
        objet: { type: 'nomination', id },
        resume:
          `Nomination de ${personne.nom} ${personne.prenom} sur ${poste.nomEtab} : ${h.vers.replace('_', ' ')}`.trim(),
        auteur: h.auteur,
        le: h.le,
        avant: i === 0 ? null : { statut: historique[i - 1].vers },
        apres: { statut: h.vers },
      }),
    )
  }

  // --- Registre : redéploiements du scénario retenu, puis nominations validées. ---
  const mouvements: Mouvement[] = resultat.assignments.map((a, i) => ({
    id: `mvt-r${i + 1}`,
    type: 'redeploiement',
    statut: 'prevu',
    annee: 'N+1',
    personne: { matricule: a.teacherId, nom: `${a.nomEns} ${a.prenomEns}`.trim() },
    origine: { id: a.schoolOrigineId, nom: a.nomEtabOrigine },
    destination: {
      id: a.schoolDestinationId,
      nom: a.nomEtabDestination,
      commune: a.communeDestination,
      region: a.regionDestination,
    },
    decision: { type: 'scenario_retenu', id: SCENARIO_RETENU, reference: null },
    creeLe: le(5),
    realiseLe: null,
  }))
  for (const n of nominations) {
    if (n.statut !== 'validee' && n.statut !== 'mise_en_oeuvre') continue
    mouvements.push({
      id: `mvt-${n.id}`,
      type: 'nomination',
      statut: n.statut === 'mise_en_oeuvre' ? 'realise' : 'prevu',
      annee: n.annee,
      personne: { matricule: n.personne.matricule, nom: `${n.personne.nom} ${n.personne.prenom}`.trim() },
      origine: n.personne.ecoleOrigine,
      destination: { id: n.poste.schoolId, nom: n.poste.nomEtab, commune: n.poste.commune, region: n.poste.region },
      decision: { type: 'nomination', id: n.id, reference: n.referenceDecision },
      creeLe: n.historique[1]?.le ?? n.creeeLe,
      realiseLe: n.dateEffet,
    })
  }

  for (const [id, detail] of details) catalogue.ajouter(F, `${base}/vivier/${encodeURIComponent(id)}/`, {}, detail)

  return { vivier, postesOuverts, rapprochements, nominations, mouvements, audit }
}
