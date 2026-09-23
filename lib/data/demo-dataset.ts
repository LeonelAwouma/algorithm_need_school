/**
 * Jeu de démonstration.
 *
 * Ces données sont entièrement fictives et générées de façon déterministe :
 * deux exécutions produisent exactement le même jeu. Elles servent uniquement à
 * parcourir l'application sans fichier réel. L'interface les signale partout
 * comme « Données de démonstration » et le rapport le rappelle explicitement :
 * elles ne constituent en aucun cas des statistiques officielles (§27).
 */

import type { NiveauPrimaire, School, Teacher, Zone } from '../../types/education'
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
}

const COMMUNES: ModeleCommune[] = [
  { region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé I', zone: 'urbaine', nbEcoles: 5 },
  { region: 'Centre', departement: 'Mfoundi', commune: 'Yaoundé VII', zone: 'urbaine', nbEcoles: 5 },
  { region: 'Centre', departement: 'Lekié', commune: 'Monatélé', zone: 'rurale', nbEcoles: 4 },
  { region: 'Centre', departement: 'Lekié', commune: 'Obala', zone: 'semi_urbaine', nbEcoles: 4 },
  { region: 'Littoral', departement: 'Wouri', commune: 'Douala III', zone: 'urbaine', nbEcoles: 5 },
  { region: 'Littoral', departement: 'Wouri', commune: 'Douala V', zone: 'urbaine', nbEcoles: 4 },
  { region: 'Littoral', departement: 'Sanaga-Maritime', commune: 'Édéa I', zone: 'semi_urbaine', nbEcoles: 3 },
  { region: 'Adamaoua', departement: 'Vina', commune: 'Ngaoundéré II', zone: 'semi_urbaine', nbEcoles: 4 },
  { region: 'Adamaoua', departement: 'Mbéré', commune: 'Meiganga', zone: 'rurale', nbEcoles: 4 },
  { region: 'Adamaoua', departement: 'Mbéré', commune: 'Dir', zone: 'rurale', nbEcoles: 3 },
]

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

      schools.push({
        id,
        nom: `EP ${modele.commune} ${QUARTIERS[indexEcole % QUARTIERS.length]}`,
        region: modele.region,
        departement: modele.departement,
        commune: modele.commune,
        zone: modele.zone,
        zoneBrute: modele.zone,
        typeEtab: 'EP',
        nbClasses,
        nbSallesClasse: nbClasses - (rnd() < 0.25 ? 1 : 0),
        nbEnseignantsEtat,
        nbAutresEnseignants: Math.floor(rnd() * 3),
        nbPostesOuvertsDeclares: Math.max(0, nbClasses - nbEnseignantsEtat + (rnd() < 0.2 ? 1 : 0)),
        classesMultigrades: modele.zone === 'rurale' && rnd() < 0.5 ? 1 + Math.floor(rnd() * 2) : 0,
        prioriteLocale: rnd() < 0.2 ? 1 + Math.floor(rnd() * 3) : 0,
        effectifTotalEleves,
        effectifFilles,
        effectifGarcons: effectifTotalEleves - effectifFilles,
        effectifParNiveau,
        ligneSource: indexEcole + 1,
      })

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
          idEtabAttache: id,
          communeAttache: modele.commune,
          departementAttache: modele.departement,
          regionAttache: modele.region,
          zoneAttache: modele.zone,
          ancienneteCarriereAns: Math.max(1, ancienneteCarriere),
          anciennetePosteAns: Math.max(0, Math.floor(rnd() * Math.max(1, ancienneteCarriere))),
          situationFamiliale: SITUATIONS[Math.floor(rnd() * SITUATIONS.length)],
          nbEnfants: Math.floor(rnd() * 5),
          formationContinue: Math.floor(rnd() * 4),
          statut: rnd() < 0.03 ? 'malade' : 'actif',
          payeParEtat: true,
          ligneSource: indexEnseignant + 1,
        })
      }
    }
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
