'use client'

/**
 * Configuration du moteur — Vue analyste uniquement.
 *
 * Les barèmes chiffrés : le score de priorité des candidats à une mutation
 * (référentiel §3.3) et le barème individuel qui ordonne les départs imposés
 * dans une école excédentaire (§3.7). Ces réglages n'apparaissent jamais en Vue
 * simplifiée : ils modifient le classement des enseignants, et cela n'a de sens
 * que si la méthodologie correspondante a été validée.
 */

import { useMemo } from 'react'
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react'
import type { EngineSettings, ReglesMobilite } from '@/types/simulation'
import { LIBELLE_SITUATION, SITUATIONS_CONNUES, inventaireSituations } from '@/lib/data/situation-familiale'
import { Notice, Panel, fmt } from '../common'
import type { PlanningStore } from '../usePlanningState'

type Scoring = EngineSettings['scoring']

const LABELS_BAREME: Record<keyof Scoring['poidsBaremeIndividuel'], string> = {
  carriereZone: 'C1 — carrière et zone difficile',
  anciennetePoste: 'C2 — ancienneté au poste',
  chargesFamiliales: 'C3 — charges familiales',
  formationContinue: 'C4 — formation continue',
  cohorteAge: 'C5 — cohorte d’âge',
}

const LABELS_APPARIEMENT: Record<keyof Scoring['poidsScoreAppariement'], string> = {
  bareme: 'Z1 — barème individuel',
  poidsPoste: 'Z2 — poids du poste (indice u)',
  proximite: 'Z3 — proximité',
  ajustements: 'Z4 — ajustements contextuels',
}

const LABELS_PROXIMITE: Record<keyof Scoring['pointsProximite'], string> = {
  memeCommune: 'Même commune',
  memeIaeb: 'Même IAEB',
  memeDepartement: 'Même département',
  memeRegion: 'Même région',
  autre: 'Hors région',
}

const LABELS_AJUSTEMENTS: Record<keyof Scoring['ajustements'], string> = {
  jeuneVersMultigrades: 'Jeune vers une école à classes multigrades',
  seniorVersEncadrement: 'Senior vers une structure d’encadrement',
  allegementSenior: 'Senior vers une école sans multigrade',
  transitionRuralUrbain: 'Rural vers urbain après 5 ans au poste',
  bonificationCiblee: 'Bonification ciblée (motif justifié)',
}

/** Champ numérique d'une sous-section du barème. */
function ChampScoring<S extends 'pointsProximite' | 'ajustements' | 'pointsCohorte' | 'seuils'>({
  section,
  cle,
  label,
  settings,
  majSettings,
}: {
  section: S
  cle: keyof Scoring[S] & string
  label: string
  settings: EngineSettings
  majSettings: PlanningStore['majSettings']
}) {
  const valeur = (settings.scoring[section] as Record<string, number>)[cle]
  return (
    <div className="field">
      <label htmlFor={`e-${section}-${cle}`}>{label}</label>
      <input
        id={`e-${section}-${cle}`}
        type="number"
        min={0}
        max={100}
        value={valeur}
        onChange={e =>
          majSettings(s => ({ ...s, scoring: { ...s.scoring, [section]: { ...(s.scoring[section] as object), [cle]: Number(e.target.value) } } }))
        }
      />
    </div>
  )
}

/** Paramètres chiffrés du score de priorité S = A + Z + B. */
const SCORE: { cle: keyof ReglesMobilite; label: string; max: number }[] = [
  { cle: 'ancienneteDebutPointsAns', label: 'A — ancienneté ouvrant droit aux points (ans)', max: 20 },
  { cle: 'pointsAncienneteBase', label: 'A — points à ce seuil', max: 50 },
  { cle: 'pointsParAnSupplementaire', label: 'A — points par année supplémentaire', max: 10 },
  { cle: 'plafondAnciennete', label: 'A — plafond', max: 100 },
  { cle: 'malusRetraite', label: 'A — retrait à l’approche de la retraite', max: 20 },
  { cle: 'pointsAnneeNiveau1', label: 'Z — points par année en école de niveau 1', max: 10 },
  { cle: 'pointsAnneeNiveau2', label: 'Z — points par année en école de niveau 2', max: 10 },
  { cle: 'plafondZoneDifficile', label: 'Z — plafond', max: 50 },
  { cle: 'bonificationMotif', label: 'B — bonification pour motif justifié', max: 50 },
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
        hint="Norme d’encadrement, minimum pédagogique, double flux, priorités des écoles et règles de mobilité se règlent dans le Référentiel."
      >
        <button type="button" className="btn" onClick={() => setPage('settings')}>
          Ouvrir le Référentiel
        </button>
      </Panel>

      <Panel
        kicker="Score de priorité (§3.3)"
        title="Comment les candidats à une même école sont départagés"
        hint="S = A + Z + B. A : ancienneté au poste ; Z : service en zone difficile ; B : bonification sur l’école visée par un motif justifié. À score égal : ancienneté générale, puis âge, puis rang de tirage au sort."
      >
        <div className="param-grid">
          {SCORE.map(({ cle, label, max }) => (
            <div className="field" key={cle}>
              <label htmlFor={`e-score-${cle}`}>{label}</label>
              <input
                id={`e-score-${cle}`}
                type="number"
                min={0}
                max={max}
                value={Number(settings.mobilite[cle])}
                onChange={e => majSettings(s => ({ ...s, mobilite: { ...s.mobilite, [cle]: Number(e.target.value) } }))}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        kicker="Barème individuel"
        title="Étage 1 — barème individuel"
        hint="C1 = ancienneté générale + points de zone difficile Z ; C2 = points d’ancienneté au poste A ; C3 = points de situation matrimoniale − points par enfant à charge ; C4 = formation continue (plafonnée) ; C5 = cohorte d’âge. Chaque critère est multiplié par son poids. Le barème ordonne les départs imposés d’une école excédentaire (le plus élevé part le premier) et entre dans le score d’appariement. Un poids à 0 neutralise le critère."
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
        <div className="param-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="e-enfant">C3 — points retirés par enfant à charge</label>
            <input id="e-enfant" type="number" min={0} max={10} value={settings.scoring.pointsParEnfant} onChange={e => majSettings(s => ({ ...s, scoring: { ...s.scoring, pointsParEnfant: Number(e.target.value) } }))} />
          </div>
          <div className="field">
            <label htmlFor="e-formation">C4 — points par formation</label>
            <input id="e-formation" type="number" min={0} max={10} value={settings.scoring.pointsParFormation} onChange={e => majSettings(s => ({ ...s, scoring: { ...s.scoring, pointsParFormation: Number(e.target.value) } }))} />
          </div>
          <div className="field">
            <label htmlFor="e-formation-max">C4 — plafond</label>
            <input id="e-formation-max" type="number" min={0} max={50} value={settings.scoring.plafondFormation} onChange={e => majSettings(s => ({ ...s, scoring: { ...s.scoring, plafondFormation: Number(e.target.value) } }))} />
          </div>
          <ChampScoring section="seuils" cle="ageJeuneAns" label="C5 — jeune avant (ans)" settings={settings} majSettings={majSettings} />
          <ChampScoring section="seuils" cle="ageSeniorAns" label="C5 — senior à partir de (ans)" settings={settings} majSettings={majSettings} />
          <ChampScoring section="pointsCohorte" cle="jeune" label="C5 — points jeune" settings={settings} majSettings={majSettings} />
          <ChampScoring section="pointsCohorte" cle="median" label="C5 — points médiane" settings={settings} majSettings={majSettings} />
          <ChampScoring section="pointsCohorte" cle="senior" label="C5 — points senior" settings={settings} majSettings={majSettings} />
        </div>
      </Panel>

      <Panel
        kicker="Étage 2"
        title="Score d’appariement enseignant ↔ poste"
        hint="Score = Z1 × barème + Z2 × poids du poste u + Z3 × points de proximité + Z4 × ajustements. Il choisit, à proximité égale, le maître proposé en redéploiement obligatoire ; en variante (Référentiel), il classe aussi les candidats à une même école."
      >
        {(Object.keys(LABELS_APPARIEMENT) as (keyof typeof LABELS_APPARIEMENT)[]).map(cle => (
          <div className="slider-row" key={cle}>
            <label htmlFor={`e-app-${cle}`}>{LABELS_APPARIEMENT[cle]}</label>
            <input
              id={`e-app-${cle}`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.scoring.poidsScoreAppariement[cle]}
              onChange={e =>
                majSettings(s => ({
                  ...s,
                  scoring: { ...s.scoring, poidsScoreAppariement: { ...s.scoring.poidsScoreAppariement, [cle]: Number(e.target.value) } },
                }))
              }
            />
            <span className="slider-value">{settings.scoring.poidsScoreAppariement[cle].toFixed(2)}</span>
          </div>
        ))}
        <p className="hint" style={{ margin: '14px 0 8px' }}>Points de proximité</p>
        <div className="param-grid">
          {(Object.keys(LABELS_PROXIMITE) as (keyof typeof LABELS_PROXIMITE)[]).map(cle => (
            <ChampScoring key={cle} section="pointsProximite" cle={cle} label={LABELS_PROXIMITE[cle]} settings={settings} majSettings={majSettings} />
          ))}
        </div>
        <p className="hint" style={{ margin: '14px 0 8px' }}>Ajustements contextuels (points)</p>
        <div className="param-grid">
          {(Object.keys(LABELS_AJUSTEMENTS) as (keyof typeof LABELS_AJUSTEMENTS)[]).map(cle => (
            <ChampScoring key={cle} section="ajustements" cle={cle} label={LABELS_AJUSTEMENTS[cle]} settings={settings} majSettings={majSettings} />
          ))}
        </div>
      </Panel>

      <Panel
        kicker="Situation matrimoniale"
        title="Points par situation déclarée"
        hint="Ces points alimentent le barème individuel. Les graphies du fichier sont rapprochées automatiquement : « Marié », « Mariée » et « MARIE(E) » comptent pour la même situation."
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
