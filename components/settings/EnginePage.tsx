'use client'

/**
 * Configuration du moteur — Vue analyste uniquement.
 *
 * Tout ce qui relève du calcul et non de la règle de gestion : poids du barème,
 * poids du score de compatibilité, points de proximité et de situation
 * familiale, seuils d'âge, phases d'affectation. Ces réglages n'apparaissent
 * jamais en Vue simplifiée : ils modifient le classement des enseignants, et
 * cela n'a de sens que si la méthodologie correspondante a été validée.
 */

import { useMemo } from 'react'
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react'
import type { EngineSettings } from '@/types/simulation'
import { LIBELLE_SITUATION, SITUATIONS_CONNUES, inventaireSituations } from '@/lib/data/situation-familiale'
import { Notice, Panel, fmt } from '../common'
import type { PlanningStore } from '../usePlanningState'

const LABELS_BAREME: Record<keyof EngineSettings['scoring']['poidsBaremeIndividuel'], string> = {
  ancienneteCarriere: 'Ancienneté de carrière',
  anciennetePoste: 'Ancienneté au poste',
  situationFamiliale: 'Situation familiale',
  nbEnfants: "Nombre d'enfants",
  formationContinue: 'Formation continue',
  ageAjuste: 'Âge ajusté',
}

const LABELS_SCORE: Record<keyof EngineSettings['scoring']['poidsScorePoste'], string> = {
  baremeEnseignant: 'Barème de l’enseignant',
  proximite: 'Proximité géographique',
  anciennetePoste: 'Ancienneté au poste',
  situationFamiliale: 'Situation familiale',
  ageRegle: 'Règle d’âge',
  zoneRegle: 'Règle de zone',
}

const LABELS_PROXIMITE: Record<keyof EngineSettings['scoring']['pointsProximite'], string> = {
  memeCommune: 'Même commune',
  memeDepartement: 'Même département',
  memeRegion: 'Même région',
  autre: 'Hors région',
}

const PHASES: { cle: keyof EngineSettings['phases']; titre: string; texte: string }[] = [
  {
    cle: 'phaseEffetPrince',
    titre: 'Passage prioritaire, sans contrainte géographique',
    texte:
      "S’exécute avant toutes les autres phases et contourne l’ordre commune puis département. Désactivé par défaut. À ne pas confondre avec l’fait de Prince, qui redéploie un enseignant désigné par la DRH et se règle dans sa propre page.",
  },
  { cle: 'phase1Commune', titre: 'Phase 1 — même commune', texte: 'Chaque enseignant est d’abord proposé sur un poste de sa commune.' },
  { cle: 'phase2Departement', titre: 'Phase 2 — même département', texte: 'Puis sur un poste de son département de rattachement.' },
  {
    cle: 'phase3JeunesVersMultigrades',
    titre: 'Phase 3 — jeunes enseignants vers classes multigrades',
    texte: 'Les enseignants sous le seuil d’âge « jeune » sont traités en priorité sur les postes restants.',
  },
  {
    cle: 'phase3AnciensRuralVersUrbain',
    titre: 'Phase 3 — anciens en zone rurale vers l’urbain',
    texte: 'Les enseignants rattachés à une zone rurale avec au moins 5 ans d’ancienneté au poste sont traités ensuite.',
  },
  { cle: 'phase4Reste', titre: 'Phase 4 — répartition du reste', texte: 'Tous les enseignants encore disponibles sont traités.' },
]

export function EnginePage({ store }: { store: PlanningStore }) {
  const { settings, majSettings, calculerScenariosDeBase, calculEnCours, donneesChargees, resultatsObsoletes, setPage, dataset } = store

  /**
   * Ce que le fichier importé contient réellement comme situations matrimoniales.
   * Une valeur qu'aucun alias ne reconnaît vaut zéro point : mieux vaut la montrer
   * que la laisser peser silencieusement sur le classement.
   */
  const situations = useMemo(
    () => inventaireSituations((dataset?.teachers ?? []).map(t => t.situationFamiliale)),
    [dataset],
  )

  /** Clés à régler : celles connues, plus toute clé ajoutée à la main dans la configuration. */
  const clesSituations = useMemo(() => {
    const cles = new Set<string>(SITUATIONS_CONNUES)
    for (const cle of Object.keys(settings.scoring.pointsSituationFamiliale)) cles.add(cle)
    return [...cles]
  }, [settings.scoring.pointsSituationFamiliale])

  return (
    <div className="stack">
      <Notice tone="warn" title="Réglages réservés à un usage averti.">
        Modifier ces paramètres change la manière dont les enseignants sont classés dans les simulations. Ces réglages
        doivent être modifiés uniquement si la méthodologie correspondante a été validée.
      </Notice>

      {resultatsObsoletes && (
        <Notice tone="warn" title="Les règles de l’analyse ont changé.">
          Les résultats affichés ont été calculés avec les anciennes règles.{' '}
          <button type="button" className="btn-link" onClick={calculerScenariosDeBase}>
            Mettre à jour les simulations
          </button>
        </Notice>
      )}

      <Panel
        kicker="Repère"
        title="Les règles de gestion sont ailleurs"
        hint="Norme d’encadrement, minimum à conserver, référentiel élèves et seuils de gravité se règlent dans le Référentiel."
      >
        <button type="button" className="btn" onClick={() => setPage('settings')}>
          Ouvrir le Référentiel
        </button>
      </Panel>

      <Panel kicker="Phases" title="Étapes activables du moteur">
        <div className="switch-list">
          {PHASES.map(phase => (
            <label className="switch-row" key={phase.cle}>
              <input
                type="checkbox"
                checked={Boolean(settings.phases[phase.cle])}
                onChange={e => majSettings(s => ({ ...s, phases: { ...s.phases, [phase.cle]: e.target.checked } }))}
              />
              <span>
                <b>{phase.titre}</b>
                <span>{phase.texte}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="param-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="e-anc-min">Ancienneté minimale au poste pour être mobilisable (ans)</label>
            <input
              id="e-anc-min"
              type="number"
              min={0}
              max={40}
              value={settings.phases.anciennetePosteMinimaleAns}
              onChange={e => majSettings(s => ({ ...s, phases: { ...s.phases, anciennetePosteMinimaleAns: Number(e.target.value) } }))}
            />
          </div>
          <div className="field">
            <label htmlFor="e-age-max">Âge maximal mobilisable (0 = sans limite)</label>
            <input
              id="e-age-max"
              type="number"
              min={0}
              max={70}
              value={settings.phases.ageMaximalMobilisableAns}
              onChange={e => majSettings(s => ({ ...s, phases: { ...s.phases, ageMaximalMobilisableAns: Number(e.target.value) } }))}
            />
          </div>
        </div>
      </Panel>

      <Panel kicker="Seuils du barème" title="Bornes d’âge et d’ancienneté">
        <div className="param-grid">
          <div className="field">
            <label htmlFor="e-bonus">Ancienneté au poste donnant le bonus plafond (ans)</label>
            <input
              id="e-bonus"
              type="number"
              min={0}
              max={25}
              value={settings.scoring.seuils.anciennetePosteBonusAns}
              onChange={e =>
                majSettings(s => ({ ...s, scoring: { ...s.scoring, seuils: { ...s.scoring.seuils, anciennetePosteBonusAns: Number(e.target.value) } } }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="e-jeune">Seuil « jeune enseignant » (≤ ans)</label>
            <input
              id="e-jeune"
              type="number"
              min={20}
              max={50}
              value={settings.scoring.seuils.ageJeuneAns}
              onChange={e => majSettings(s => ({ ...s, scoring: { ...s.scoring, seuils: { ...s.scoring.seuils, ageJeuneAns: Number(e.target.value) } } }))}
            />
          </div>
          <div className="field">
            <label htmlFor="e-age">Seuil « enseignant plus âgé » (≥ ans)</label>
            <input
              id="e-age"
              type="number"
              min={40}
              max={70}
              value={settings.scoring.seuils.ageAgeAns}
              onChange={e => majSettings(s => ({ ...s, scoring: { ...s.scoring, seuils: { ...s.scoring.seuils, ageAgeAns: Number(e.target.value) } } }))}
            />
          </div>
        </div>
      </Panel>

      <Panel
        kicker="Barème individuel"
        title="Poids du classement des enseignants"
        hint="Chaque critère est multiplié par son poids, puis additionné. « Nombre d’enfants » et « Situation familiale » y figurent au même titre que l’ancienneté : mettre un poids à 0 neutralise le critère."
      >
        {(Object.keys(LABELS_BAREME) as (keyof typeof LABELS_BAREME)[]).map(cle => (
          <div className="slider-row" key={cle}>
            <label htmlFor={`e-bareme-${cle}`}>{LABELS_BAREME[cle]}</label>
            <input
              id={`e-bareme-${cle}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.scoring.poidsBaremeIndividuel[cle]}
              onChange={e =>
                majSettings(s => ({
                  ...s,
                  scoring: { ...s.scoring, poidsBaremeIndividuel: { ...s.scoring.poidsBaremeIndividuel, [cle]: Number(e.target.value) } },
                }))
              }
            />
            <span className="slider-value">{settings.scoring.poidsBaremeIndividuel[cle].toFixed(2)}</span>
          </div>
        ))}
      </Panel>

      <Panel kicker="Score de compatibilité" title="Poids du choix enseignant ↔ poste">
        {(Object.keys(LABELS_SCORE) as (keyof typeof LABELS_SCORE)[]).map(cle => (
          <div className="slider-row" key={cle}>
            <label htmlFor={`e-score-${cle}`}>{LABELS_SCORE[cle]}</label>
            <input
              id={`e-score-${cle}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.scoring.poidsScorePoste[cle]}
              onChange={e =>
                majSettings(s => ({
                  ...s,
                  scoring: { ...s.scoring, poidsScorePoste: { ...s.scoring.poidsScorePoste, [cle]: Number(e.target.value) } },
                }))
              }
            />
            <span className="slider-value">{settings.scoring.poidsScorePoste[cle].toFixed(2)}</span>
          </div>
        ))}
      </Panel>

      <Panel kicker="Proximité" title="Points attribués selon la distance administrative">
        <div className="param-grid">
          {(Object.keys(LABELS_PROXIMITE) as (keyof typeof LABELS_PROXIMITE)[]).map(cle => (
            <div className="field" key={cle}>
              <label htmlFor={`e-prox-${cle}`}>{LABELS_PROXIMITE[cle]}</label>
              <input
                id={`e-prox-${cle}`}
                type="number"
                min={0}
                max={200}
                step={5}
                value={settings.scoring.pointsProximite[cle]}
                onChange={e =>
                  majSettings(s => ({
                    ...s,
                    scoring: { ...s.scoring, pointsProximite: { ...s.scoring.pointsProximite, [cle]: Number(e.target.value) } },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        kicker="Situation matrimoniale"
        title="Points par situation déclarée"
        hint="Ces points alimentent le barème individuel et le score de compatibilité. Les graphies du fichier sont rapprochées automatiquement : « Marié », « Mariée » et « MARIE(E) » comptent pour la même situation."
      >
        <div className="param-grid">
          {clesSituations.map(cle => {
            const observee = situations.reconnues.find(r => r.cle === cle)
            return (
              <div className="field" key={cle}>
                <label htmlFor={`e-sit-${cle}`}>{LIBELLE_SITUATION[cle] ?? cle}</label>
                <input
                  id={`e-sit-${cle}`}
                  type="number"
                  min={0}
                  max={50}
                  value={settings.scoring.pointsSituationFamiliale[cle] ?? 0}
                  onChange={e =>
                    majSettings(s => ({
                      ...s,
                      scoring: { ...s.scoring, pointsSituationFamiliale: { ...s.scoring.pointsSituationFamiliale, [cle]: Number(e.target.value) } },
                    }))
                  }
                />
                <span className="hint">
                  {observee
                    ? `${fmt(observee.effectif)} enseignant(s) — ${observee.graphies.slice(0, 3).join(', ')}${observee.graphies.length > 3 ? '…' : ''}`
                    : donneesChargees
                      ? 'aucun enseignant dans ce cas'
                      : 'aucune donnée chargée'}
                </span>
              </div>
            )
          })}
        </div>

        {situations.nonReconnues.length > 0 && (
          <Notice tone="warn" title="Des situations déclarées ne sont rattachées à aucun barème.">
            Ces valeurs du fichier ne correspondent à aucune situation connue : elles valent <strong>0 point</strong> dans le
            classement. Ajoutez-les ci-dessous pour leur attribuer des points.
          </Notice>
        )}

        {situations.nonReconnues.length > 0 && (
          <ul className="reason-list" style={{ marginTop: 12 }}>
            {situations.nonReconnues.slice(0, 8).map(v => (
              <li key={v.valeur}>
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  <strong>« {v.valeur} »</strong> — {fmt(v.effectif)} enseignant(s).{' '}
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() =>
                      majSettings(s => ({
                        ...s,
                        scoring: {
                          ...s.scoring,
                          pointsSituationFamiliale: { ...s.scoring.pointsSituationFamiliale, [v.valeur.trim().toLowerCase()]: 0 },
                        },
                      }))
                    }
                  >
                    Ajouter au barème
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {situations.nonRenseignees > 0 && (
          <p className="hint" style={{ marginTop: 10 }}>
            {fmt(situations.nonRenseignees)} enseignant(s) n’ont aucune situation matrimoniale renseignée : ce critère vaut 0
            point pour eux, les autres critères du barème s’appliquent normalement.
          </p>
        )}
      </Panel>

      <Panel kicker="Vérification" title="Configuration effective">
        <div className="topbar-actions" style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-primary" disabled={!donneesChargees || calculEnCours} onClick={calculerScenariosDeBase}>
            <RefreshCw size={14} className={calculEnCours ? 'spin' : undefined} aria-hidden="true" /> Mettre à jour les simulations
          </button>
        </div>
        <details className="advanced">
          <summary>
            <ShieldAlert size={13} aria-hidden="true" /> Voir la configuration complète (JSON)
          </summary>
          <pre className="code">{JSON.stringify(settings, null, 2)}</pre>
        </details>
      </Panel>
    </div>
  )
}
