'use client'

/**
 * Page Méthodologie (§22) : compréhensible sans connaissance technique, avec
 * les formules disponibles mais au second plan.
 */

import { BookOpen, Download, Printer } from 'lucide-react'
import { NOTIONS, REGLES_MOTEUR, VOCABULAIRE } from '@/lib/methodology'
import { downloadMethodologyDocx } from '@/lib/export-methodology-docx'
import { MENTION_SIMULATION } from '@/lib/analytics/narrative'
import { Notice, Panel } from '../common'
import type { PlanningStore } from '../usePlanningState'

export function MethodologyPage({ store }: { store: PlanningStore }) {
  const { settings } = store

  return (
    <div className="stack">
      <Panel
        kicker="Référentiel de calcul"
        title="Comment les chiffres sont obtenus"
        hint="Cette page explique, sans supposer de connaissances techniques, ce que signifie chaque indicateur et comment il est calculé."
        actions={
          <>
            <button type="button" className="btn" onClick={() => window.print()}>
              <Printer size={14} aria-hidden="true" /> Imprimer
            </button>
            <button type="button" className="btn" onClick={() => void downloadMethodologyDocx()}>
              <Download size={14} aria-hidden="true" /> Télécharger (Word)
            </button>
          </>
        }
      >
        <Notice tone="info" title="Statut des résultats.">
          {MENTION_SIMULATION}
        </Notice>
      </Panel>

      <Panel kicker="Notions" title="Les notions, une par une">
        <div className="stack">
          {NOTIONS.map(notion => (
            <article key={notion.titre} style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              <h3 style={{ fontSize: 15, color: 'var(--ink)' }}>{notion.titre}</h3>
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.65, maxWidth: '75ch' }}>{notion.explication}</p>
              {notion.parametrable && (
                <p className="hint" style={{ maxWidth: '75ch' }}>
                  <strong>Paramétrable :</strong> {notion.parametrable}
                </p>
              )}
              {notion.formule && (
                <details className="advanced">
                  <summary>Voir la formule exacte</summary>
                  <pre className="code">{notion.formule}</pre>
                </details>
              )}
            </article>
          ))}
        </div>
      </Panel>

      <Panel kicker="Paramétrage actuel" title="Valeurs effectivement appliquées">
        <dl className="def-grid">
          <div>
            <dt>Année scolaire</dt>
            <dd style={{ fontSize: 13 }}>{settings.anneeScolaire}</dd>
          </div>
          <div>
            <dt>Un maître pour</dt>
            <dd>{settings.besoin.elevesParMaitre} élèves</dd>
          </div>
          <div>
            <dt>Tolérance d’arrondi</dt>
            <dd>{settings.besoin.toleranceArrondi} élève(s)</dd>
          </div>
          <div>
            <dt>Niveaux tenus par un maître</dt>
            <dd>{settings.besoin.niveauxParMaitre}</dd>
          </div>
          <div>
            <dt>Double flux</dt>
            <dd style={{ fontSize: 13 }}>{settings.besoin.doubleFluxAutorise ? 'Autorisé' : 'Non autorisé'}</dd>
          </div>
          <div>
            <dt>Âge de la retraite</dt>
            <dd>{settings.besoin.ageRetraite} ans</dd>
          </div>
          <div>
            <dt>Stabilité minimale au poste</dt>
            <dd>{settings.mobilite.stabiliteMinimaleAns} ans</dd>
          </div>
          <div>
            <dt>Ordre d’examen des vœux</dt>
            <dd style={{ fontSize: 13 }}>{settings.mobilite.ordreExamen === 'voeux' ? 'Ordre de l’enseignant' : 'Poids des écoles'}</dd>
          </div>
          <div>
            <dt>Attrition hors retraite</dt>
            <dd>{settings.recrutement.tauxAttritionHorsRetraite.toLocaleString('fr-FR')} %</dd>
          </div>
          <div>
            <dt>Source des postes</dt>
            <dd style={{ fontSize: 13 }}>
              {settings.sourceDesPostes === 'besoinCalcule'
                ? 'Besoin calculé'
                : settings.sourceDesPostes === 'postesDeclares'
                  ? 'Postes déclarés'
                  : 'Maximum des deux'}
            </dd>
          </div>
          <div>
            <dt>Seuil déficit faible</dt>
            <dd>{Math.round(settings.seuilsSeverite.faible * 100)} %</dd>
          </div>
          <div>
            <dt>Seuil déficit important</dt>
            <dd>{Math.round(settings.seuilsSeverite.important * 100)} %</dd>
          </div>

        </dl>
        <p className="hint" style={{ marginTop: 10 }}>
          Valeurs par défaut du Référentiel technique de modélisation, désignées par lui comme paramètres à valider par la DRH.
          Elles sont modifiables depuis le Référentiel ; chaque changement relance le calcul.
        </p>
      </Panel>

      <Panel kicker="Pour aller plus loin" title="Règles exactes appliquées par le moteur">
        <ul className="reason-list">
          {REGLES_MOTEUR.map(regle => (
            <li key={regle.titre} style={{ display: 'block' }}>
              <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 2 }}>{regle.titre}</strong>
              <span style={{ fontSize: 13, lineHeight: 1.6 }}>{regle.texte}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel kicker="Vocabulaire" title="Termes techniques et leurs équivalents">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Terme technique (Vue analyste)</th>
              <th>Formulation employée en Vue simplifiée</th>
            </tr>
          </thead>
          <tbody>
            {VOCABULAIRE.map(v => (
              <tr key={v.technique}>
                <th scope="row">{v.technique}</th>
                <td>{v.simplifie}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel kicker="Fonctionnement" title="Traitement local et absence d’IA">
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.65, maxWidth: '75ch' }}>
          <BookOpen size={15} aria-hidden="true" /> Les classeurs sont lus dans le navigateur, les calculs s’exécutent sur le
          poste de l’utilisateur, la carte s’appuie sur un fichier géographique embarqué, et les exports sont générés
          localement. Aucune donnée d’établissement, d’enseignant ou d’élève ne quitte la machine, et aucune intelligence
          artificielle générative n’intervient dans l’analyse : les textes de diagnostic proviennent de modèles de phrases
          déclenchés par des conditions sur les valeurs calculées.
        </p>
      </Panel>
    </div>
  )
}
