/**
 * Jeu de démonstration.
 *
 * Ces données sont entièrement fictives et générées de façon déterministe :
 * deux exécutions produisent exactement le même jeu. Elles servent uniquement à
 * parcourir l'application sans fichier réel. L'interface les signale partout
 * comme « Données de démonstration » et le rapport le rappelle explicitement :
 * elles ne constituent en aucun cas des statistiques officielles (§27).
 */

import type { MotifDemande, NiveauPrimaire, School, Teacher, Zone, ZoneSecurite } from '../../types/education'
import type { Dataset } from '../../types/simulation'
import { ageFromBirthDate } from './normalize'

/** Générateur pseudo-aléatoire local et reproductible (congruentiel linéaire). */
function generateur(graine: number): () => number {
  let etat = graine
  return () => {
    etat = (etat * 1103515245 + 12345) % 2147483648
    return etat / 2147483648
  }
}

interface ModeleCommune {
  region: string
  departement: string
  commune: string
  zone: Zone
  nbEcoles: number
  /** Zone de sécurité de la commune (référentiel §3.1). */
  securite: ZoneSecurite
  /** Une partie des écoles rurales est enclavée. */
  enclavee?: boolean
}

const COMMUNES: ModeleCommune[] = [
  { region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé I', zone: 'urbaine', nbEcoles: 5, securite: 'verte' },
  { region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé VII', zone: 'urbaine', nbEcoles: 5, securite: 'verte' },
  { region: 'Centre', departement: 'Lekié', commune: 'Monatélé', zone: 'rurale', nbEcoles: 4, securite: 'verte', enclavee: true },
  { region: 'Centre', departement: 'Lekié', commune: 'Obala', zone: 'semi_urbaine', nbEcoles: 4, securite: 'verte' },
  { region: 'Littoral', departement: 'Wouri', commune: 'Douala III', zone: 'urbaine', nbEcoles: 5, securite: 'verte' },
  { region: 'Littoral', departement: 'Wouri', commune: 'Douala V', zone: 'urbaine', nbEcoles: 4, securite: 'verte' },
  { region: 'Littoral', departement: 'Sanaga-Maritime', commune: 'Édéa I', zone: 'semi_urbaine', nbEcoles: 3, securite: 'verte' },
  { region: 'Adamaoua', departement: 'Vina', commune: 'Ngaoundéré II', zone: 'semi_urbaine', nbEcoles: 4, securite: 'jaune' },
  { region: 'Adamaoua', departement: 'Mbéré', commune: 'Meiganga', zone: 'rurale', nbEcoles: 4, securite: 'jaune' },
  { region: 'Adamaoua', departement: 'Mbéré', commune: 'Dir', zone: 'rurale', nbEcoles: 3, securite: 'rouge', enclavee: true },
]

const MOTIFS: MotifDemande[] = ['convenance', 'convenance', 'regroupement_familial', 'sante', 'rotation_zone_difficile']

const QUARTIERS = [
  'Centre', 'Nord', 'Sud', 'Est', 'Ouest', 'Marché', 'Mission', 'Plateau',
  'Rivière', 'Gare', 'Camp', 'Carrefour',
]

const NOMS = ['Abena', 'Bello', 'Choupo', 'Djomo', 'Eyenga', 'Fouda', 'Gwet', 'Hamadou', 'Ivo', 'Jiofack', 'Kamdem', 'Lobe', 'Mbarga', 'Ndongo', 'Onana', 'Pouth', 'Roger', 'Sadjo', 'Tchoua', 'Voundi']
const PRENOMS = ['Alice', 'Bernard', 'Clarisse', 'Daniel', 'Estelle', 'François', 'Georgette', 'Hervé', 'Irène', 'Joseph', 'Karine', 'Ludovic', 'Marthe', 'Norbert', 'Odile', 'Patrick', 'Rachel', 'Samuel', 'Thérèse', 'Victor']
const SITUATIONS = ['celibataire', 'marie', 'marie', 'divorce', 'veuf']
const NIVEAUX: NiveauPrimaire[] = ['CI', 'CP', 'CE1', 'CE2', 'CM1', 'CM2']

/** Construit le jeu de démonstration complet (écoles et enseignants). */
export function construireJeuDemonstration(reference: Date = new Date()): Dataset {
  const rnd = generateur(20250918)
  const schools: School[] = []
  const teachers: Teacher[] = []

  let indexEcole = 0
  let indexEnseignant = 0

  for (const modele of COMMUNES) {
    for (let i = 0; i < modele.nbEcoles; i++) {
      indexEcole++
      const id = `DEMO-E${String(indexEcole).padStart(4, '0')}`
      const nbClasses = 4 + Math.floor(rnd() * 9)

      // Une école sur trois environ est en excédent, les autres en déficit ou
      // à l'équilibre : le jeu reste lisible sur toutes les pages.
      const tirage = rnd()
      const ecart = tirage < 0.35 ? Math.ceil(rnd() * 3) : tirage < 0.6 ? 0 : -Math.ceil(rnd() * 4)
      const nbEnseignantsEtat = Math.max(1, nbClasses + ecart)

      const elevesParClasse = modele.zone === 'urbaine' ? 48 + Math.floor(rnd() * 30) : 32 + Math.floor(rnd() * 22)
      const effectifTotalEleves = nbClasses * elevesParClasse
      const effectifParNiveau: Partial<Record<NiveauPrimaire, number>> = {}
      let restant = effectifTotalEleves
      for (let k = 0; k < NIVEAUX.length; k++) {
        const part = k === NIVEAUX.length - 1 ? restant : Math.round(effectifTotalEleves / 6 + (rnd() - 0.5) * 12)
        const valeur = Math.max(0, Math.min(restant, part))
        effectifParNiveau[NIVEAUX[k]] = valeur
        restant -= valeur
      }
      const effectifFilles = Math.round(effectifTotalEleves * (0.45 + rnd() * 0.1))

      // La première école de Yaoundé I est bilingue : deux sections, deux unités de calcul (§2.4).
      const bilingue = indexEcole === 1
      schools.push({
        id: bilingue ? `${id}-FR` : id,
        codeEcole: id,
        iaeb: `IAEB ${modele.commune}`,
        latitude: null,
        longitude: null,
        nom: `EP ${modele.commune} ${QUARTIERS[indexEcole % QUARTIERS.length]}${bilingue ? ' (section francophone)' : ''}`,
        region: modele.region,
        departement: modele.departement,
        commune: modele.commune,
        zone: modele.zone,
        zoneBrute: modele.zone,
        typeEtab: 'EP',
        nbClasses,
        nbSallesClasse: nbClasses - (rnd() < 0.25 ? 1 : 0),
        sallesDoubleFlux: modele.zone === 'urbaine' && rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0,
        niveauxOuverts: 6,
        departsConnusDeclares: null,
        sousSysteme: 'francophone',
        zoneSecurite: modele.securite,
        accessibilite: modele.zone === 'rurale' ? (modele.enclavee && rnd() < 0.7 ? 'rural_enclave' : 'rural') : 'urbain',
        estStructure: false,
        nbEnseignantsEtat,
        nbAutresEnseignants: Math.floor(rnd() * 3),
        nbPostesOuvertsDeclares: Math.max(0, nbClasses - nbEnseignantsEtat + (rnd() < 0.2 ? 1 : 0)),
        // Une école de moins de 6 classes regroupe forcément des niveaux ; les écoles rurales en regroupent parfois davantage.
        classesMultigrades: Math.min(6, Math.max(0, 6 - nbClasses) + (modele.zone === 'rurale' && rnd() < 0.5 ? 1 + Math.floor(rnd() * 2) : 0)),
        classesMultigradesRenseignees: true,
        prioriteLocale: rnd() < 0.2 ? 1 + Math.floor(rnd() * 3) : 0,
        effectifTotalEleves,
        effectifFilles,
        effectifGarcons: effectifTotalEleves - effectifFilles,
        effectifParNiveau,
        ligneSource: indexEcole + 1,
      })

      const idUnite = bilingue ? `${id}-FR` : id
      for (let k = 0; k < nbEnseignantsEtat; k++) {
        indexEnseignant++
        const anneeNaissance = 1965 + Math.floor(rnd() * 35)
        const dateNaissance = new Date(Date.UTC(anneeNaissance, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)))
        const ancienneteCarriere = Math.min(reference.getFullYear() - anneeNaissance - 22, Math.floor(rnd() * 30))

        teachers.push({
          id: `DEMO-T${String(indexEnseignant).padStart(5, '0')}`,
          nom: NOMS[indexEnseignant % NOMS.length],
          prenom: PRENOMS[(indexEnseignant * 7) % PRENOMS.length],
          dateNaissance,
          age: ageFromBirthDate(dateNaissance, reference),
          idEtabAttache: idUnite,
          communeAttache: modele.commune,
          departementAttache: modele.departement,
          regionAttache: modele.region,
          zoneAttache: modele.zone,
          iaebAttache: `IAEB ${modele.commune}`,
          ancienneteCarriereAns: Math.max(1, ancienneteCarriere),
          anciennetePosteAns: Math.max(0, Math.floor(rnd() * Math.max(1, ancienneteCarriere))),
          situationFamiliale: SITUATIONS[Math.floor(rnd() * SITUATIONS.length)],
          nbEnfants: Math.floor(rnd() * 5),
          formationContinue: Math.floor(rnd() * 4),
          statut: rnd() < 0.03 ? 'malade' : 'actif',
          payeParEtat: true,
          sexe: rnd() < 0.55 ? 'F' : 'M',
          categorie: rnd() < 0.5 ? 'IEG' : 'IEMP',
          fonction: 'Chargé de classe',
          sousSysteme: 'francophone',
          voeux: [],
          motifDemande: null,
          ecoleMotif: null,
          anneesZoneNiveau1: modele.securite === 'rouge' ? Math.floor(rnd() * 5) : 0,
          anneesZoneNiveau2: modele.zone === 'rurale' || modele.securite === 'jaune' ? Math.floor(rnd() * 6) : Math.floor(rnd() * 2),
          rangTirage: indexEnseignant,
          ligneSource: indexEnseignant + 1,
        })
      }
    }
  }

  // Section anglophone de l'école bilingue : mêmes code et locaux, élèves et maîtres propres.
  const premiere = schools[0]
  if (premiere) {
    const id = `${premiere.codeEcole}-EN`
    schools.push({
      ...premiere,
      id,
      nom: premiere.nom.replace('section francophone', 'section anglophone'),
      sousSysteme: 'anglophone',
      nbClasses: 6,
      nbSallesClasse: 5,
      sallesDoubleFlux: 0,
      nbEnseignantsEtat: 8,
      effectifTotalEleves: 180,
      effectifFilles: 92,
      effectifGarcons: 88,
      effectifParNiveau: { CI: 32, CP: 31, CE1: 30, CE2: 30, CM1: 29, CM2: 28 },
      ligneSource: schools.length + 1,
    })
    for (let k = 0; k < 8; k++) {
      indexEnseignant++
      const dateNaissance = new Date(Date.UTC(1975 + k * 2, 3, 12))
      teachers.push({
        id: `DEMO-T${String(indexEnseignant).padStart(5, '0')}`,
        nom: NOMS[(indexEnseignant * 3) % NOMS.length],
        prenom: PRENOMS[(indexEnseignant * 5) % PRENOMS.length],
        dateNaissance,
        age: ageFromBirthDate(dateNaissance, reference),
        idEtabAttache: id,
        communeAttache: premiere.commune,
        departementAttache: premiere.departement,
        regionAttache: premiere.region,
        zoneAttache: premiere.zone,
        iaebAttache: premiere.iaeb,
        ancienneteCarriereAns: 6 + k,
        anciennetePosteAns: 4 + k,
        situationFamiliale: SITUATIONS[k % SITUATIONS.length],
        nbEnfants: k % 4,
        formationContinue: 1,
        statut: 'actif',
        payeParEtat: true,
        sexe: k % 2 ? 'F' : 'M',
        categorie: 'IEG',
        fonction: 'Chargé de classe',
        sousSysteme: 'anglophone',
        voeux: [],
        motifDemande: null,
        ecoleMotif: null,
        anneesZoneNiveau1: 0,
        anneesZoneNiveau2: 0,
        rangTirage: indexEnseignant,
        ligneSource: indexEnseignant + 1,
      })
    }
  }

  // Une inspection d'arrondissement (IAEB) par département, avec un poste fixé par la hiérarchie.
  const departements = new Map<string, School>()
  for (const s of schools) if (!departements.has(s.departement)) departements.set(s.departement, s)
  let indexStructure = 0
  for (const s of departements.values()) {
    indexStructure++
    schools.push({
      ...s,
      id: `DEMO-IAEB${String(indexStructure).padStart(2, '0')}`,
      codeEcole: `DEMO-IAEB${String(indexStructure).padStart(2, '0')}`,
      nom: `IAEB de ${s.commune}`,
      typeEtab: 'IAEB',
      estStructure: true,
      sousSysteme: null,
      nbClasses: 0,
      nbSallesClasse: null,
      sallesDoubleFlux: null,
      niveauxOuverts: null,
      nbEnseignantsEtat: 0,
      nbAutresEnseignants: null,
      nbPostesOuvertsDeclares: 1,
      classesMultigrades: 0,
      iaeb: `IAEB ${s.commune}`,
      prioriteLocale: 0,
      effectifTotalEleves: null,
      effectifFilles: null,
      effectifGarcons: null,
      effectifParNiveau: {},
      ligneSource: schools.length + 1,
    })
  }

  // Demandes de mutation : environ un enseignant sur cinq, trois vœux au plus, dans son département.
  const ecoles = schools.filter(s => !s.estStructure)
  for (const t of teachers) {
    if (rnd() >= 0.2) continue
    const proches = ecoles.filter(s => s.departement === t.departementAttache && s.id !== t.idEtabAttache && s.sousSysteme === t.sousSysteme)
    if (proches.length === 0) continue
    const nb = 1 + Math.floor(rnd() * 3)
    const voeux: string[] = []
    for (let k = 0; k < nb && voeux.length < proches.length; k++) {
      const choix = proches[Math.floor(rnd() * proches.length)].codeEcole
      if (!voeux.includes(choix)) voeux.push(choix)
    }
    // Une demande sur dix vise une école d'une autre région (niveau central).
    if (rnd() < 0.1) {
      const lointaine = ecoles.find(s => s.region !== t.regionAttache && s.sousSysteme === t.sousSysteme)
      if (lointaine) voeux.push(lointaine.codeEcole)
    }
    t.voeux = voeux.slice(0, 3)
    t.motifDemande = MOTIFS[Math.floor(rnd() * MOTIFS.length)]
    t.ecoleMotif = t.motifDemande === 'sante' || t.motifDemande === 'regroupement_familial' ? t.voeux[0] ?? null : null
  }

  return {
    schools,
    teachers,
    demonstration: true,
    importedAt: new Date().toISOString(),
    sourceFiles: { etablissements: 'Données de démonstration', enseignants: 'Données de démonstration' },
  }
}

/** Mention affichée partout où le jeu de démonstration est utilisé. */
export const MENTION_DEMONSTRATION =
  "Données de démonstration — valeurs fictives générées par l'application. Elles ne constituent pas des statistiques officielles."
