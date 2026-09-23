'use client'

/**
 * Référentiel — les règles de l'analyse, accessibles à tous.
 *
 * Cette page ne contient aucun paramètre mathématique. Chaque réglage est
 * formulé comme une phrase qu'un responsable éducatif peut lire et valider sans
 * connaissance technique ; les poids, seuils d'âge et pondérations du barème
 * vivent dans « Configuration du moteur », en Vue analyste.
 */

import { useRef, useState } from 'react'
import { Download, RefreshCw, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react'
import type { EngineSettings } from '@/types/simulation'
import { DEFAULT_SETTINGS, mergeSettings } from '@/lib/config/settings'
import { exporterJSON } from '@/lib/reporting/export-csv'
import { Notice, Panel } from '../common'
import type { PlanningStore } from '../usePlanningState'

/** Un réglage présenté comme une phrase à compléter. */
function Regle({
  enonce,
  precision,
  htmlFor,
  children,
}: {
  enonce: string
  precision?: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="regle">
      <label htmlFor={htmlFor} className="regle-enonce">
        {enonce}
      </label>
      <div className="regle-valeur">{children}</div>
      {precision && <p className="regle-precision">{precision}</p>}
    </div>
  )
}

export function ReferentialPage({ store }: { store: PlanningStore }) {
  const { settings, majSettings, mode, setPage, calculerScenariosDeBase, calculEnCours, donneesChargees, resultatsObsoletes } = store
  const [erreurImport, setErreurImport] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function chargerConfiguration(file?: File) {
    if (!file) return
    file
      .text()
      .then(texte => {
        const brut: unknown = JSON.parse(texte)
        if (typeof brut !== 'object' || brut === null) throw new Error('Le fichier ne contient pas un jeu de règles exploitable.')
        majSettings(courant => mergeSettings(courant, brut as Partial<EngineSettings>))
        setErreurImport(null)
      })
      .catch(err => setErreurImport(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div className="stack">
      <Notice tone="info" title="Ce que vous réglez ici.">
        Ces règles déterminent comment l’application calcule les besoins et les excédents. Ce sont des choix de votre
        institution, pas des normes fournies par le logiciel. Elles sont reprises telles quelles dans la Méthodologie et dans
        le rapport décisionnel.
      </Notice>

      {resultatsObsoletes && (
        <Notice tone="warn" title="Les règles de l’analyse ont changé.">
          Les résultats affichés ont été calculés avec les anciennes règles.{' '}
          <button type="button" className="btn-link" onClick={calculerScenariosDeBase}>
            Mettre à jour les simulations
          </button>
        </Notice>
      )}

      <Panel kicker="Période" title="Sur quelle année porte l’analyse">
        <div className="regles">
          <Regle enonce="Les données analysées portent sur l’année scolaire" htmlFor="r-annee">
            <input
              id="r-annee"
              type="text"
              value={settings.anneeScolaire}
              onChange={e => majSettings(s => ({ ...s, anneeScolaire: e.target.value }))}
            />
          </Regle>
        </div>
      </Panel>

      <Panel
        kicker="Encadrement"
        title="Combien d’enseignants il faut, et combien il faut garder"
        hint="Ces deux règles décident, pour chaque école, s’il lui manque des enseignants ou si elle peut en céder."
      >
        <div className="regles">
          <Regle
            enonce="Pour fonctionner normalement, une classe nécessite"
            precision="Avec la valeur 1, une école de 8 classes a besoin de 8 enseignants."
            htmlFor="r-norme"
          >
            <input
              id="r-norme"
              type="number"
              min={0.5}
              max={3}
              step={0.1}
              value={settings.normeEncadrement.enseignantsParClasse}
              onChange={e => majSettings(s => ({ ...s, normeEncadrement: { enseignantsParClasse: Number(e.target.value) } }))}
            />
            <span className="regle-unite">enseignant(s)</span>
          </Regle>

          <Regle
            enonce="Quelle que soit la situation, une école doit conserver au minimum"
            precision="Aucune simulation ne peut faire descendre une école sous ce seuil. C’est ce qui borne le nombre d’enseignants qu’elle peut céder."
            htmlFor="r-minimum"
          >
            <select
              id="r-minimum"
              value={settings.minimumAConserver.mode}
              onChange={e =>
                majSettings(s => ({
                  ...s,
                  minimumAConserver: { ...s.minimumAConserver, mode: e.target.value as EngineSettings['minimumAConserver']['mode'] },
                }))
              }
            >
              <option value="nbClasses">1 enseignant par classe</option>
              <option value="ratioClasses">une proportion de son nombre de classes</option>
              <option value="valeurFixe">un nombre fixe d’enseignants</option>
            </select>
            {settings.minimumAConserver.mode === 'ratioClasses' && (
              <>
                <input
                  aria-label="Proportion du nombre de classes"
                  type="number"
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={settings.minimumAConserver.ratio}
                  onChange={e => majSettings(s => ({ ...s, minimumAConserver: { ...s.minimumAConserver, ratio: Number(e.target.value) } }))}
                />
                <span className="regle-unite">× le nombre de classes</span>
              </>
            )}
            {settings.minimumAConserver.mode === 'valeurFixe' && (
              <>
                <input
                  aria-label="Nombre fixe d’enseignants à conserver"
                  type="number"
                  min={0}
                  max={50}
                  value={settings.minimumAConserver.valeurFixe}
                  onChange={e => majSettings(s => ({ ...s, minimumAConserver: { ...s.minimumAConserver, valeurFixe: Number(e.target.value) } }))}
                />
                <span className="regle-unite">enseignant(s)</span>
              </>
            )}
          </Regle>

          <Regle
            enonce="Les postes à pourvoir dans les simulations sont établis à partir"
            precision="Le besoin calculé est déduit des classes et des effectifs présents. Les postes déclarés proviennent du fichier importé, quand il les contient."
            htmlFor="r-source"
          >
            <select
              id="r-source"
              value={settings.sourceDesPostes}
              onChange={e => majSettings(s => ({ ...s, sourceDesPostes: e.target.value as EngineSettings['sourceDesPostes'] }))}
            >
              <option value="besoinCalcule">du besoin calculé par l’application</option>
              <option value="postesDeclares">des postes déclarés dans le fichier</option>
              <option value="maximum">du plus élevé des deux</option>
            </select>
          </Regle>
        </div>
      </Panel>

      <Panel
        kicker="Pression pédagogique"
        title="À partir de quand une école est considérée sous forte pression"
        hint="Tant que cette valeur n’est pas renseignée, l’application n’affiche aucun indicateur de pression : elle ne suppose aucune norme."
      >
        <div className="regles">
          <Regle
            enonce="Une école est sous forte pression lorsque le nombre d’élèves par enseignant dépasse"
            htmlFor="r-cible"
          >
            <input
              id="r-cible"
              type="number"
              min={1}
              max={200}
              value={settings.referentielEleves.cible ?? ''}
              placeholder="Non défini"
              onChange={e =>
                majSettings(s => ({
                  ...s,
                  referentielEleves: { ...s.referentielEleves, cible: e.target.value === '' ? null : Number(e.target.value) },
                }))
              }
            />
            <span className="regle-unite">élèves</span>
          </Regle>

          <Regle enonce="Cette valeur provient de" precision="Renseignez la source pour qu’elle apparaisse dans le rapport." htmlFor="r-source-ref">
            <input
              id="r-source-ref"
              type="text"
              value={settings.referentielEleves.source}
              placeholder="À renseigner"
              onChange={e => majSettings(s => ({ ...s, referentielEleves: { ...s.referentielEleves, source: e.target.value } }))}
            />
          </Regle>

          <Regle enonce="Et se rapporte à l’année" htmlFor="r-annee-ref">
            <input
              id="r-annee-ref"
              type="text"
              value={settings.referentielEleves.annee}
              placeholder="À renseigner"
              onChange={e => majSettings(s => ({ ...s, referentielEleves: { ...s.referentielEleves, annee: e.target.value } }))}
            />
          </Regle>

          <Regle enonce="Remarque à conserver avec cette valeur" htmlFor="r-commentaire-ref">
            <input
              id="r-commentaire-ref"
              type="text"
              value={settings.referentielEleves.commentaire}
              onChange={e => majSettings(s => ({ ...s, referentielEleves: { ...s.referentielEleves, commentaire: e.target.value } }))}
            />
          </Regle>
        </div>
      </Panel>

      <Panel
        kicker="Gravité"
        title="Comment qualifier l’ampleur d’un déficit"
        hint="Ces seuils décident du classement des écoles entre déficit faible, important et critique."
      >
        <div className="regles">
          <Regle
            enonce="Le déficit d’une école reste qualifié de faible tant qu’il ne dépasse pas"
            htmlFor="r-seuil-faible"
          >
            <input
              id="r-seuil-faible"
              type="number"
              min={5}
              max={50}
              step={1}
              value={Math.round(settings.seuilsSeverite.faible * 100)}
              onChange={e => majSettings(s => ({ ...s, seuilsSeverite: { ...s.seuilsSeverite, faible: Number(e.target.value) / 100 } }))}
            />
            <span className="regle-unite">% de ses besoins</span>
          </Regle>

          <Regle
            enonce="Il devient critique au-delà de"
            precision="Entre les deux valeurs, le déficit est qualifié d’important."
            htmlFor="r-seuil-important"
          >
            <input
              id="r-seuil-important"
              type="number"
              min={10}
              max={90}
              step={1}
              value={Math.round(settings.seuilsSeverite.important * 100)}
              onChange={e => majSettings(s => ({ ...s, seuilsSeverite: { ...s.seuilsSeverite, important: Number(e.target.value) / 100 } }))}
            />
            <span className="regle-unite">% de ses besoins</span>
          </Regle>
        </div>
      </Panel>

      <Panel kicker="Priorités" title="Quelles écoles servir en premier, à situation comparable">
        <div className="switch-list">
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.phases.prioriteClassesMultigrades}
              onChange={e => majSettings(s => ({ ...s, phases: { ...s.phases, prioriteClassesMultigrades: e.target.checked } }))}
            />
            <span>
              <b>Prioriser les écoles avec classes multigrades</b>
              <span>À compatibilité équivalente, ces écoles passent avant les autres dans les simulations.</span>
            </span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.phases.prioriteZonesRurales}
              onChange={e => majSettings(s => ({ ...s, phases: { ...s.phases, prioriteZonesRurales: e.target.checked } }))}
            />
            <span>
              <b>Prioriser les écoles en zone rurale</b>
              <span>À compatibilité équivalente, les postes ruraux passent avant les autres.</span>
            </span>
          </label>
        </div>
      </Panel>

      <Panel kicker="Sauvegarde" title="Conserver ou réutiliser ce jeu de règles">
        {erreurImport && (
          <Notice tone="alert" title="Fichier de règles illisible.">
            {erreurImport}
          </Notice>
        )}
        <div className="topbar-actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={() => exporterJSON('regles-analyse-algobaba.json', settings)}>
            <Download size={14} aria-hidden="true" /> Enregistrer ces règles dans un fichier
          </button>
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <Upload size={14} aria-hidden="true" /> Charger des règles enregistrées
          </button>
          <input ref={inputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => chargerConfiguration(e.target.files?.[0])} />
          <button type="button" className="btn btn-danger" onClick={() => majSettings(() => DEFAULT_SETTINGS)}>
            <RotateCcw size={14} aria-hidden="true" /> Rétablir les règles par défaut
          </button>
          <button type="button" className="btn btn-primary" disabled={!donneesChargees || calculEnCours} onClick={calculerScenariosDeBase}>
            <RefreshCw size={14} className={calculEnCours ? 'spin' : undefined} aria-hidden="true" /> Mettre à jour les simulations
          </button>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Ces règles sont conservées sur ce poste pour votre prochaine ouverture. Elles ne contiennent aucune donnée
          d’établissement, d’enseignant ni d’élève.
        </p>
      </Panel>

      {mode === 'analyste' && (
        <Panel kicker="Vue analyste" title="Réglages mathématiques du moteur">
          <p className="hint" style={{ marginBottom: 12 }}>
            Les poids du barème, les seuils d’âge et les phases d’affectation sont regroupés sur une page distincte.
          </p>
          <button type="button" className="btn" onClick={() => setPage('engine')}>
            <SlidersHorizontal size={14} aria-hidden="true" /> Ouvrir la configuration du moteur
          </button>
        </Panel>
      )}
    </div>
  )
}
