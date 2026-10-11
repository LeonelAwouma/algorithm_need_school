'use client'

/**
 * Référentiel — les règles de l'analyse.
 *
 * Chaque réglage reprend un « paramètre à valider par la DRH » du Référentiel
 * technique de modélisation, formulé comme une phrase qu'un responsable éducatif
 * peut lire et valider sans connaissance technique. Les barèmes chiffrés du
 * score de priorité et du barème individuel vivent dans « Configuration du
 * moteur », en Vue analyste.
 */

import { useRef, useState, type ReactNode } from 'react'
import { Download, RefreshCw, RotateCcw, SlidersHorizontal, Upload } from 'lucide-react'
import type { EngineSettings, ReglesBesoin, ReglesMobilite, ReglesPriorite } from '@/types/simulation'
import { DEFAULT_SETTINGS, mergeSettings } from '@/lib/config/settings'
import { exporterJSON } from '@/lib/reporting/export-csv'
import { Notice, Panel } from '../common'
import type { PlanningStore } from '../usePlanningState'

/** Un réglage présenté comme une phrase à compléter. */
function Regle({ enonce, precision, htmlFor, children }: { enonce: string; precision?: string; htmlFor: string; children: ReactNode }) {
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

/** Case à cocher décrite par un titre et une conséquence. */
function Interrupteur({ titre, texte, coche, onChange }: { titre: string; texte: string; coche: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch-row">
      <input type="checkbox" checked={coche} onChange={e => onChange(e.target.checked)} />
      <span>
        <b>{titre}</b>
        <span>{texte}</span>
      </span>
    </label>
  )
}

export function ReferentialPage({ store }: { store: PlanningStore }) {
  const { settings, majSettings, mode, setPage, calculerScenariosDeBase, calculEnCours, donneesChargees, resultatsObsoletes } = store
  const [erreurImport, setErreurImport] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const besoin = <K extends keyof ReglesBesoin>(cle: K, valeur: ReglesBesoin[K]) =>
    majSettings(s => ({ ...s, besoin: { ...s.besoin, [cle]: valeur } }))
  const mobilite = <K extends keyof ReglesMobilite>(cle: K, valeur: ReglesMobilite[K]) =>
    majSettings(s => ({ ...s, mobilite: { ...s.mobilite, [cle]: valeur } }))
  const priorite = (maj: (p: ReglesPriorite) => ReglesPriorite) => majSettings(s => ({ ...s, priorite: maj(s.priorite) }))
  const nombre = (v: string) => (v === '' ? 0 : Number(v))

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

  const p = settings.priorite

  return (
    <div className="stack">
      <Notice tone="info" title="Ce que vous réglez ici.">
        Ces règles sont celles du Référentiel technique de modélisation des plans de rotation, de redéploiement et de
        déploiement. Le référentiel les désigne comme paramètres à valider par la DRH : les valeurs proposées sont ses valeurs
        par défaut. Elles sont reprises telles quelles dans la Méthodologie et dans le rapport.
      </Notice>

      {resultatsObsoletes && (
        <Notice tone="warn" title="Les règles de l’analyse ont changé.">
          Les résultats affichés ont été calculés avec les anciennes règles.{' '}
          <button type="button" className="btn-link" onClick={calculerScenariosDeBase}>
            Mettre à jour les simulations
          </button>
        </Notice>
      )}

      <Panel kicker="Période" title="Sur quelle rentrée porte le plan">
        <div className="regles">
          <Regle
            enonce="Le plan prépare la rentrée de l’année scolaire"
            precision="Les départs à la retraite sont repérés à la date du 1er septembre de cette rentrée ; la projection N+2 porte sur la rentrée suivante."
            htmlFor="r-annee"
          >
            <input id="r-annee" type="text" value={settings.anneeScolaire} onChange={e => majSettings(s => ({ ...s, anneeScolaire: e.target.value }))} />
          </Regle>
        </div>
      </Panel>

      <Panel
        kicker="Besoin d’une école (§2.2 à §2.4)"
        title="Combien de maîtres il faut, et combien les salles permettent d’en affecter"
        hint="Ces règles décident, pour chaque école, s’il lui manque des maîtres, si elle en a de trop, ou s’il lui manque des salles."
      >
        <div className="regles">
          <Regle enonce="La norme d’encadrement est d’un maître pour" precision="Note de cadrage : 60 élèves. 250 élèves demandent alors ⌈250 ÷ 60⌉ = 5 maîtres." htmlFor="r-norme">
            <input id="r-norme" type="number" min={20} max={120} value={settings.besoin.elevesParMaitre} onChange={e => besoin('elevesParMaitre', nombre(e.target.value))} />
            <span className="regle-unite">élèves</span>
          </Regle>
          <Regle
            enonce="Avant d’ouvrir un poste, on tolère un dépassement de"
            precision="0 : arrondi supérieur strict. Avec 20 élèves, une école de 250 élèves ne demande plus que 4 maîtres."
            htmlFor="r-tolerance"
          >
            <input id="r-tolerance" type="number" min={0} max={59} value={settings.besoin.toleranceArrondi} onChange={e => besoin('toleranceArrondi', nombre(e.target.value))} />
            <span className="regle-unite">élèves</span>
          </Regle>
          <Regle
            enonce="Pour le minimum pédagogique, un maître tient"
            precision="Avec 2 niveaux par maître, une école complète de 6 niveaux a besoin d’au moins 3 maîtres, quel que soit son effectif."
            htmlFor="r-niveaux"
          >
            <select id="r-niveaux" value={settings.besoin.niveauxParMaitre} onChange={e => besoin('niveauxParMaitre', Number(e.target.value))}>
              <option value={1}>un seul niveau</option>
              <option value={2}>deux niveaux (classes multigrades)</option>
              <option value={3}>trois niveaux</option>
            </select>
          </Regle>
          <Regle enonce="Un enseignant part à la retraite à" precision="Les départs connus à la rentrée sont déduits de l’effectif ; ceux de l’année suivante alimentent la projection N+2." htmlFor="r-retraite">
            <input id="r-retraite" type="number" min={50} max={70} value={settings.besoin.ageRetraite} onChange={e => besoin('ageRetraite', nombre(e.target.value))} />
            <span className="regle-unite">ans</span>
          </Regle>
          <Regle
            enonce="Sans effectif d’élèves, une classe nécessite"
            precision="Repli signalé : le référentiel calcule le besoin à partir des élèves attendus. Les écoles concernées sont listées dans la qualité des données."
            htmlFor="r-repli"
          >
            <input id="r-repli" type="number" min={0.5} max={3} step={0.1} value={settings.besoin.enseignantsParClasseRepli} onChange={e => besoin('enseignantsParClasseRepli', nombre(e.target.value))} />
            <span className="regle-unite">maître(s)</span>
          </Regle>
          <Regle
            enonce="Les postes à pourvoir sont établis à partir"
            precision="Le besoin calculé suit la règle du référentiel. Les postes déclarés proviennent du fichier importé, quand il les contient."
            htmlFor="r-source"
          >
            <select id="r-source" value={settings.sourceDesPostes} onChange={e => majSettings(s => ({ ...s, sourceDesPostes: e.target.value as EngineSettings['sourceDesPostes'] }))}>
              <option value="besoinCalcule">du besoin calculé (règle du référentiel)</option>
              <option value="postesDeclares">des postes déclarés dans le fichier</option>
              <option value="maximum">du plus élevé des deux</option>
            </select>
          </Regle>
        </div>
        <div className="switch-list" style={{ marginTop: 10 }}>
          <Interrupteur
            titre="Le double flux est autorisé"
            texte="Une salle utilisée en double flux compte pour deux maîtres dans BMAX. Désactivé, chaque salle compte pour un seul maître."
            coche={settings.besoin.doubleFluxAutorise}
            onChange={v => besoin('doubleFluxAutorise', v)}
          />
          <Interrupteur
            titre="Minimum pédagogique école par école, selon ses classes multigrades"
            texte="Quand le fichier renseigne les classes multigrades : une école sans multigrade a un maître par niveau ouvert, chaque classe multigrade en économise un, sans descendre sous le regroupement ci-dessus. Désactivé, le regroupement s’applique à toutes les écoles."
            coche={settings.besoin.minimumSelonMultigrades}
            onChange={v => besoin('minimumSelonMultigrades', v)}
          />
          <Interrupteur
            titre="Déduire les départs connus"
            texte="Les maîtres qui partent à la retraite à la rentrée ne sont pas comptés dans l’effectif E."
            coche={settings.besoin.deduireDepartsConnus}
            onChange={v => besoin('deduireDepartsConnus', v)}
          />
        </div>
      </Panel>

      <Panel kicker="Gravité" title="Comment qualifier l’ampleur d’un besoin" hint="Le besoin d’une école est rapporté à sa cible K.">
        <div className="regles">
          <Regle enonce="Le besoin reste qualifié de faible tant qu’il ne dépasse pas" htmlFor="r-seuil-faible">
            <input
              id="r-seuil-faible"
              type="number"
              min={5}
              max={50}
              value={Math.round(settings.seuilsSeverite.faible * 100)}
              onChange={e => majSettings(s => ({ ...s, seuilsSeverite: { ...s.seuilsSeverite, faible: Number(e.target.value) / 100 } }))}
            />
            <span className="regle-unite">% de la cible</span>
          </Regle>
          <Regle enonce="Il devient critique au-delà de" precision="Entre les deux valeurs, il est qualifié d’important." htmlFor="r-seuil-important">
            <input
              id="r-seuil-important"
              type="number"
              min={10}
              max={90}
              value={Math.round(settings.seuilsSeverite.important * 100)}
              onChange={e => majSettings(s => ({ ...s, seuilsSeverite: { ...s.seuilsSeverite, important: Number(e.target.value) / 100 } }))}
            />
            <span className="regle-unite">% de la cible</span>
          </Regle>
        </div>
      </Panel>

      <Panel
        kicker="Priorité des écoles (§3.1)"
        title="Quelles écoles servir en premier"
        hint="Indice de priorité u = poids de vulnérabilité w (accessibilité + sécurité) + points de besoin β selon le REM actuel. Valeurs à valider par la hiérarchie."
      >
        <div className="param-grid">
          {(
            [
              ['urbain', 'Accessibilité — urbain'],
              ['semi_urbain', 'Accessibilité — semi-urbain'],
              ['rural', 'Accessibilité — rural'],
              ['rural_enclave', 'Accessibilité — rural enclavé'],
            ] as const
          ).map(([cle, label]) => (
            <div className="field" key={cle}>
              <label htmlFor={`r-acc-${cle}`}>{label}</label>
              <input
                id={`r-acc-${cle}`}
                type="number"
                min={0}
                max={50}
                value={p.pointsAccessibilite[cle]}
                onChange={e => priorite(x => ({ ...x, pointsAccessibilite: { ...x.pointsAccessibilite, [cle]: nombre(e.target.value) } }))}
              />
            </div>
          ))}
          {(
            [
              ['verte', 'Sécurité — zone verte'],
              ['jaune', 'Sécurité — zone jaune'],
              ['rouge', 'Sécurité — zone rouge'],
            ] as const
          ).map(([cle, label]) => (
            <div className="field" key={cle}>
              <label htmlFor={`r-sec-${cle}`}>{label}</label>
              <input
                id={`r-sec-${cle}`}
                type="number"
                min={0}
                max={50}
                value={p.pointsSecurite[cle]}
                onChange={e => priorite(x => ({ ...x, pointsSecurite: { ...x.pointsSecurite, [cle]: nombre(e.target.value) } }))}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="r-coef-a">Coefficient de l’accessibilité dans w</label>
            <input id="r-coef-a" type="number" min={0} max={2} step={0.05} value={p.coefAccessibilite} onChange={e => priorite(x => ({ ...x, coefAccessibilite: nombre(e.target.value) }))} />
          </div>
          <div className="field">
            <label htmlFor="r-coef-s">Coefficient de la sécurité dans w</label>
            <input id="r-coef-s" type="number" min={0} max={2} step={0.05} value={p.coefSecurite} onChange={e => priorite(x => ({ ...x, coefSecurite: nombre(e.target.value) }))} />
          </div>
          <div className="field">
            <label htmlFor="r-n1">Niveau de difficulté 1 à partir de (points)</label>
            <input id="r-n1" type="number" min={0} max={100} value={p.seuilNiveau1} onChange={e => priorite(x => ({ ...x, seuilNiveau1: nombre(e.target.value) }))} />
          </div>
          <div className="field">
            <label htmlFor="r-n2">Niveau de difficulté 2 à partir de (points)</label>
            <input id="r-n2" type="number" min={0} max={100} value={p.seuilNiveau2} onChange={e => priorite(x => ({ ...x, seuilNiveau2: nombre(e.target.value) }))} />
          </div>
        </div>

        <p className="hint" style={{ margin: '16px 0 8px' }}>Points de besoin β selon le REM actuel (élèves par maître en poste)</p>
        <div className="param-grid">
          {p.tranchesBesoin.map((t, i) => (
            <div className="field" key={i}>
              <label htmlFor={`r-tr-${i}`}>REM jusqu’à {t.remMax}</label>
              <input
                id={`r-tr-${i}`}
                type="number"
                min={0}
                max={50}
                value={t.points}
                onChange={e =>
                  priorite(x => ({ ...x, tranchesBesoin: x.tranchesBesoin.map((y, j) => (j === i ? { ...y, points: nombre(e.target.value) } : y)) }))
                }
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="r-tr-au-dela">Au-delà, ou école sans maître</label>
            <input id="r-tr-au-dela" type="number" min={0} max={50} value={p.pointsBesoinAuDela} onChange={e => priorite(x => ({ ...x, pointsBesoinAuDela: nombre(e.target.value) }))} />
          </div>
        </div>
      </Panel>

      <Panel
        kicker="Rotation et redéploiement (§3.2 à §3.9)"
        title="Qui peut demander une mutation, et comment les situations restantes sont traitées"
      >
        <div className="regles">
          <Regle
            enonce="Une demande est recevable à partir de"
            precision="Durée de stabilité au poste, à confirmer : 5 ans imposés aux nouvelles recrues par leur contrat."
            htmlFor="r-stabilite"
          >
            <input id="r-stabilite" type="number" min={0} max={20} value={settings.mobilite.stabiliteMinimaleAns} onChange={e => mobilite('stabiliteMinimaleAns', nombre(e.target.value))} />
            <span className="regle-unite">ans au poste</span>
          </Regle>
          <Regle enonce="Chaque enseignant peut formuler au plus" htmlFor="r-voeux">
            <input id="r-voeux" type="number" min={1} max={3} value={settings.mobilite.nombreMaxVoeux} onChange={e => mobilite('nombreMaxVoeux', nombre(e.target.value))} />
            <span className="regle-unite">vœu(x)</span>
          </Regle>
          <Regle
            enonce="Les vœux de chaque enseignant sont examinés"
            precision="Dans l’ordre de l’enseignant, ajouter une école à sa liste ne peut jamais lui nuire. Par poids, un enseignant a intérêt à retirer une école difficile de sa liste."
            htmlFor="r-ordre"
          >
            <select id="r-ordre" value={settings.mobilite.ordreExamen} onChange={e => mobilite('ordreExamen', e.target.value as ReglesMobilite['ordreExamen'])}>
              <option value="voeux">dans l’ordre choisi par l’enseignant (par défaut)</option>
              <option value="poids">de l’école la plus difficile à la plus facile (variante)</option>
            </select>
          </Regle>
          <Regle
            enonce="Une école départage les candidats qui la demandent selon"
            precision="Le référentiel retient le score de priorité S = A + Z + B. Le score d’appariement (barème, poids du poste, proximité, ajustements) est proposé en variante ; dans les deux cas l’appariement reste l’acceptation différée."
            htmlFor="r-classement"
          >
            <select id="r-classement" value={settings.mobilite.classementCandidats} onChange={e => mobilite('classementCandidats', e.target.value as ReglesMobilite['classementCandidats'])}>
              <option value="score_priorite">le score de priorité S = A + Z + B (référentiel)</option>
              <option value="score_appariement">le score d’appariement (variante)</option>
            </select>
          </Regle>
          <Regle enonce="Un enseignant est considéré proche de la retraite à moins de" htmlFor="r-proche">
            <input id="r-proche" type="number" min={0} max={10} value={settings.mobilite.anneesAvantRetraite} onChange={e => mobilite('anneesAvantRetraite', nombre(e.target.value))} />
            <span className="regle-unite">ans de la retraite</span>
          </Regle>
        </div>
        <div className="switch-list" style={{ marginTop: 10 }}>
          <Interrupteur
            titre="Traiter les vœux des enseignants"
            texte="Phase 1 : satisfaction des vœux par acceptation différée. Désactivée, seuls les redéploiements hors vœux et obligatoires sont simulés."
            coche={settings.mobilite.phaseVoeux}
            onChange={v => mobilite('phaseVoeux', v)}
          />
          <Interrupteur
            titre="Exiger la stabilité minimale pour un redéploiement obligatoire"
            texte="Un maître n’est déplacé d’office qu’après la même durée au poste qu’une demande de mutation."
            coche={settings.mobilite.stabilitePourObligatoire}
            onChange={v => mobilite('stabilitePourObligatoire', v)}
          />
          <Interrupteur
            titre="Protéger les enseignants proches de la retraite"
            texte="Ils ne reçoivent ni proposition hors vœux ni transfert imposé ; leurs vœux restent examinés."
            coche={settings.mobilite.protegerProchesRetraite}
            onChange={v => mobilite('protegerProchesRetraite', v)}
          />
          <Interrupteur
            titre="Rechercher la solution la plus proche"
            texte="Un candidat dont aucun vœu n’est satisfait reçoit le poste ouvert le plus proche de ses vœux, soumis à son accord."
            coche={settings.mobilite.solutionProche}
            onChange={v => mobilite('solutionProche', v)}
          />
          <Interrupteur
            titre="Simuler le redéploiement obligatoire"
            texte="Les écoles restées non couvertes reçoivent un maître de l’école excédentaire la plus proche du même sous-système."
            coche={settings.mobilite.redeploiementObligatoire}
            onChange={v => mobilite('redeploiementObligatoire', v)}
          />
          <Interrupteur
            titre="Appliquer la règle de la zone rouge"
            texte="Aucun poste en zone rouge n’est proposé hors vœux ni imposé : il n’est pourvu que par des volontaires ou par le recrutement."
            coche={settings.mobilite.regleZoneRouge}
            onChange={v => mobilite('regleZoneRouge', v)}
          />
          <Interrupteur
            titre="Projeter le vivier sur l’année N+2"
            texte="Les enseignants restés sans affectation sont rapprochés des postes qui doivent se libérer pendant l’année N+1."
            coche={settings.mobilite.projectionN2}
            onChange={v => mobilite('projectionN2', v)}
          />
          <Interrupteur
            titre="Nouveaux recrutés : à note égale, priorité à la candidate"
            texte="Règle évoquée par le référentiel mais à vérifier au regard des dispositions applicables : désactivée par défaut."
            coche={settings.mobilite.departageFeminin}
            onChange={v => mobilite('departageFeminin', v)}
          />
        </div>
      </Panel>

      <Panel kicker="Recrutement à prévoir (§2.6)" title="Départs imprévisibles à anticiper">
        <div className="regles">
          <Regle
            enonce="Chaque année, hors retraites, quittent la profession"
            precision="Taux d’attrition τ* (définition UNESCO, indicateur ODD 4.c.6). Recrutement à prévoir = besoin restant après redéploiement + ⌈τ* × effectif ÷ 100⌉, par sous-système."
            htmlFor="r-attrition"
          >
            <input
              id="r-attrition"
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={settings.recrutement.tauxAttritionHorsRetraite}
              onChange={e => majSettings(s => ({ ...s, recrutement: { tauxAttritionHorsRetraite: nombre(e.target.value) } }))}
            />
            <span className="regle-unite">% des enseignants</span>
          </Regle>
        </div>
      </Panel>

      <Panel kicker="Sauvegarde" title="Conserver ou réutiliser ce jeu de règles">
        {erreurImport && (
          <Notice tone="alert" title="Fichier de règles illisible.">
            {erreurImport}
          </Notice>
        )}
        <div className="topbar-actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={() => exporterJSON('regles-analyse-algoplanr.json', settings)}>
            <Download size={14} aria-hidden="true" /> Enregistrer ces règles dans un fichier
          </button>
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <Upload size={14} aria-hidden="true" /> Charger des règles enregistrées
          </button>
          <input ref={inputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => chargerConfiguration(e.target.files?.[0])} />
          <button type="button" className="btn btn-danger" onClick={() => majSettings(() => DEFAULT_SETTINGS)}>
            <RotateCcw size={14} aria-hidden="true" /> Rétablir les valeurs du référentiel
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
        <Panel kicker="Vue analyste" title="Barèmes chiffrés du moteur">
          <p className="hint" style={{ marginBottom: 12 }}>
            Le score de priorité des candidats et le barème individuel du redéploiement obligatoire se règlent sur une page distincte.
          </p>
          <button type="button" className="btn" onClick={() => setPage('engine')}>
            <SlidersHorizontal size={14} aria-hidden="true" /> Ouvrir la configuration du moteur
          </button>
        </Panel>
      )}
    </div>
  )
}
