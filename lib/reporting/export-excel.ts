/**
 * Export Excel complet du diagnostic et de la simulation.
 *
 * Reprend et étend le classeur existant : les feuilles historiques
 * (affectations, non affectés, postes non pourvus, vivier) sont conservées, et
 * s'y ajoutent le diagnostic école par école, les agrégats territoriaux, la
 * qualité des données et le rapport décisionnel.
 *
 * `xlsx` est importé dynamiquement pour ne pas alourdir le chargement initial
 * de l'application ; la génération reste entièrement locale.
 */

import type { SchoolDiagnostic, TerritorialSummary } from '../../types/education'
import type { DataQualityReport } from '../../types/data-quality'
import type { DecisionReport, DiagnosticResult, SimulationResult } from '../../types/simulation'
import { LIBELLE_PROXIMITE } from '../simulation/scoring'
import type { CellValue } from './export-csv'

const SEVERITE_LABEL: Record<SchoolDiagnostic['severite'], string> = {
  excedent: 'Excédent mobilisable',
  satisfaisant: 'Situation satisfaisante',
  deficit_faible: 'Déficit faible',
  deficit_important: 'Déficit important',
  deficit_critique: 'Déficit critique',
}

export interface ExcelExportInput {
  diagnostic: DiagnosticResult
  arbre: TerritorialSummary
  qualite: DataQualityReport | null
  resultat: SimulationResult | null
  comparaison: SimulationResult[]
  rapport: DecisionReport | null
}

/** Aplatit l'arbre territorial en lignes région / département / commune. */
function lignesTerritoriales(arbre: TerritorialSummary): CellValue[][] {
  const lignes: CellValue[][] = []
  const visiter = (noeud: TerritorialSummary) => {
    if (noeud.territory.level !== 'national') {
      lignes.push([
        noeud.territory.level,
        noeud.territory.region ?? '',
        noeud.territory.departement ?? '',
        noeud.territory.commune ?? '',
        noeud.totals.ecolesAnalysees,
        noeud.totals.ecolesEnDeficit,
        noeud.totals.ecolesAvecExcedent,
        noeud.totals.classes,
        noeud.totals.enseignantsEtat,
        noeud.totals.postesNecessaires,
        noeud.totals.postesDeclares ?? '',
        noeud.totals.excedentMobilisable,
        noeud.totals.effectifTotalEleves ?? '',
        noeud.totals.elevesParEnseignantEtat ?? '',
      ])
    }
    for (const enfant of noeud.children) visiter(enfant)
  }
  visiter(arbre)
  return lignes
}

export async function exporterClasseurComplet(input: ExcelExportInput): Promise<Uint8Array> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const ajouter = (nom: string, entetes: string[], lignes: CellValue[][]) => {
    const feuille = XLSX.utils.aoa_to_sheet([entetes, ...lignes])
    // Excel limite les noms d'onglets à 31 caractères.
    XLSX.utils.book_append_sheet(wb, feuille, nom.slice(0, 31))
  }

  const { diagnostic, arbre, qualite, resultat, comparaison, rapport } = input
  const t = arbre.totals

  ajouter(
    'Synthese',
    ['Indicateur', 'Valeur'],
    [
      ['Année scolaire', diagnostic.settings.anneeScolaire],
      ['Établissements analysés', t.ecolesAnalysees],
      ['Établissements en déficit', t.ecolesEnDeficit],
      ['Établissements avec excédent', t.ecolesAvecExcedent],
      ['Classes', t.classes],
      ["Enseignants payés par l'État", t.enseignantsEtat],
      ['Postes nécessaires (besoin calculé)', t.postesNecessaires],
      ['Postes officiellement déclarés', t.postesDeclares ?? 'Non renseigné'],
      ['Enseignants potentiellement redéployables', t.excedentMobilisable],
      ['Élèves', t.effectifTotalEleves ?? 'Non renseigné'],
      ["Élèves par enseignant État", t.elevesParEnseignantEtat ?? 'Non renseigné'],
      ['Postes couverts par la simulation', resultat?.postesCouverts ?? 'Aucune simulation'],
      ['Besoin résiduel', resultat?.besoinResiduel ?? 'Aucune simulation'],
      ['Statut', "Simulation d'aide à la décision — ne constitue pas une décision administrative"],
    ],
  )

  ajouter(
    'Diagnostic_Ecoles',
    [
      'Code', 'Établissement', 'Région', 'Département', 'Commune', 'Zone', 'Type',
      'Classes', "Enseignants État", 'Autres enseignants', 'Minimum à conserver',
      'Besoin calculé', 'Postes déclarés', 'Écart déclaré/calculé', 'Excédent mobilisable',
      'Élèves', 'Élèves/enseignant', "Élèves/enseignant État", 'Élèves/classe',
      'Classes multigrades', 'Priorité locale', 'Situation',
    ],
    diagnostic.schools.map(d => [
      d.school.id, d.school.nom, d.school.region, d.school.departement, d.school.commune, d.school.zoneBrute, d.school.typeEtab,
      d.nbClasses, d.enseignantsEtat, d.school.nbAutresEnseignants ?? '', d.enseignantsMinimumAConserver,
      d.besoinTheorique, d.postesDeclares ?? '', d.ecartBesoinDeclare ?? '', d.excedentTheorique,
      d.school.effectifTotalEleves ?? '', d.elevesParEnseignant ?? '', d.elevesParEnseignantEtat ?? '', d.elevesParClasse ?? '',
      d.school.classesMultigrades, d.school.prioriteLocale, SEVERITE_LABEL[d.severite],
    ]),
  )

  ajouter(
    'Territoires',
    ['Niveau', 'Région', 'Département', 'Commune', 'Écoles', 'En déficit', 'Avec excédent', 'Classes', "Enseignants État", 'Postes nécessaires', 'Postes déclarés', 'Excédent mobilisable', 'Élèves', "Élèves/enseignant État"],
    lignesTerritoriales(arbre),
  )

  if (qualite) {
    ajouter(
      'Qualite_Donnees',
      ['Type', 'Problème', 'Nombre', 'Conséquence', 'Exemples', 'Points retirés'],
      [
        ...qualite.errors.map(e => ['Erreur', e.label, e.count, e.consequence, e.exemples.join(', '), -e.penalite] as CellValue[]),
        ...qualite.warnings.map(w => ['Avertissement', w.label, w.count, w.consequence, w.exemples.join(', '), -w.penalite] as CellValue[]),
        ...qualite.missingFields.map(f => [f.bloquant ? 'Colonne requise absente' : 'Colonne absente', f.label, '', f.consequence, '', f.bloquant ? -12 : 0] as CellValue[]),
        ['Score', `${qualite.score} / 100 (${qualite.appreciation})`, '', '', '', ''],
      ],
    )
  }

  if (resultat) {
    ajouter(
      'Affectations',
      ['Phase', 'Poste', 'Matricule', 'Nom', 'Prénom', 'École origine', 'Commune origine', 'École destination', 'Commune destination', 'Département destination', 'Région destination', 'Périmètre du mouvement', 'Barème', 'Score'],
      resultat.assignments.map(a => [
        a.phase, a.postId, a.teacherId, a.nomEns, a.prenomEns,
        a.nomEtabOrigine, a.communeOrigine, a.nomEtabDestination, a.communeDestination, a.departementDestination, a.regionDestination,
        LIBELLE_PROXIMITE[a.niveauProximite], a.bareme, a.score,
      ]),
    )

    ajouter(
      'Justification_Affectations',
      ['Poste', 'Matricule', 'Composante du score', 'Valeur', 'Poids', 'Contribution'],
      resultat.assignments.flatMap(a =>
        a.breakdown.components.map(c => [a.postId, a.teacherId, c.label, c.valeur, c.poids, c.contribution] as CellValue[]),
      ),
    )

    ajouter(
      'Vivier_Mobilisable',
      ['Matricule', 'Nom', 'Prénom', 'École origine', 'Commune', 'Département', 'Excédent de l’école', 'Rang dans l’école', 'Ancienneté poste', 'Âge', 'Barème', 'Affecté'],
      resultat.pool.teachers.map(p => [
        p.teacher.id, p.teacher.nom, p.teacher.prenom, p.ecoleOrigine.nom,
        p.teacher.communeAttache, p.teacher.departementAttache,
        p.ecoleOrigine.excedentMobilisable, p.rangDansEcole,
        p.teacher.anciennetePosteAns, p.teacher.age == null ? '' : Math.floor(p.teacher.age),
        p.bareme, p.affecte ? 'Oui' : 'Non',
      ]),
    )

    ajouter(
      'Ecoles_Sources',
      ['Code', 'Établissement', 'Région', 'Département', 'Commune', 'Excédent mobilisable', 'Candidats retenus'],
      resultat.pool.ecolesSources.map(e => [e.schoolId, e.nomEtab, e.region, e.departement, e.commune, e.excedentMobilisable, e.candidatsRetenus]),
    )

    ajouter(
      'Non_Affectes',
      ['Matricule', 'Nom', 'Prénom', 'École origine', 'Commune', 'Département', 'Barème'],
      resultat.unmatchedTeachers.map(p => [
        p.teacher.id, p.teacher.nom, p.teacher.prenom, p.ecoleOrigine.nom,
        p.teacher.communeAttache, p.teacher.departementAttache, p.bareme,
      ]),
    )

    ajouter(
      'Postes_Non_Pourvus',
      ['Poste', 'Code établissement', 'Établissement', 'Commune', 'Département', 'Région', 'Zone', 'Classes multigrades'],
      resultat.uncoveredPosts.map(p => [p.id, p.schoolId, p.nomEtab, p.commune, p.departement, p.region, p.zone, p.classesMultigrades]),
    )

    ajouter(
      'Avant_Apres',
      ['Indicateur', 'Avant', 'Après', 'Variation'],
      [
        ['Établissements en déficit', resultat.before.ecolesEnDeficit, resultat.after.ecolesEnDeficit, resultat.after.ecolesEnDeficit - resultat.before.ecolesEnDeficit],
        ['Postes vacants', resultat.before.postesVacants, resultat.after.postesVacants, resultat.after.postesVacants - resultat.before.postesVacants],
        ['Déficit total', resultat.before.deficitTotal, resultat.after.deficitTotal, resultat.after.deficitTotal - resultat.before.deficitTotal],
        ['Pression moyenne élèves/enseignant État', resultat.before.pressionMoyenne ?? 'Non renseigné', resultat.after.pressionMoyenne ?? 'Non renseigné', ''],
      ],
    )

    ajouter(
      'Controles',
      ['Contrôle', 'Résultat', 'Détail'],
      resultat.invariants.map(i => [i.label, i.ok ? 'Conforme' : 'Non conforme', i.detail]),
    )

    ajouter(
      'Journal_Simulation',
      ['Étape', 'Message', 'Valeur'],
      resultat.logs.map(l => [l.etape, l.message, l.valeur ?? '']),
    )
  }

  const decisionsPrince = (resultat?.faitsPrince ?? []).filter(e => e.statut === 'applique')
  if (decisionsPrince.length > 0) {
    ajouter(
      'Fait_De_Prince',
      ['Matricule', 'Enseignant', 'École origine', 'Commune origine', 'École destination', 'Commune destination', 'Décidé le', 'Référence'],
      decisionsPrince.map(({ fait }) => [
        fait.teacherId,
        fait.enseignant,
        fait.origine.nom,
        fait.origine.commune,
        fait.destination.nom,
        fait.destination.commune,
        new Date(fait.decideLe).toLocaleDateString('fr-FR'),
        fait.reference,
      ]),
    )
  }

  if (comparaison.length > 0) {
    ajouter(
      'Comparaison_Scenarios',
      ['Indicateur', ...comparaison.map(c => c.scenarioNom)],
      [
        ['Postes nécessaires', ...comparaison.map(c => c.besoinInitial)],
        ['Postes couverts', ...comparaison.map(c => c.postesCouverts)],
        ['Enseignants déplacés', ...comparaison.map(c => c.enseignantsDeplaces)],
        ['Écoles bénéficiaires', ...comparaison.map(c => c.ecolesBeneficiaires)],
        ['Écoles sources', ...comparaison.map(c => c.ecolesSources)],
        ['Besoin résiduel', ...comparaison.map(c => c.besoinResiduel)],
        ['Taux de couverture', ...comparaison.map(c => Math.round(c.tauxCouverture * 100) / 100)],
      ],
    )
  }

  if (rapport) {
    const lignes: CellValue[][] = []
    for (const section of rapport.sections) {
      lignes.push([section.titre, ''])
      for (const p of section.paragraphes) lignes.push(['', p])
      for (const p of section.points ?? []) lignes.push(['', `• ${p}`])
      lignes.push(['', ''])
    }
    ajouter('Rapport_Decisionnel', ['Section', 'Contenu'], lignes)
  }

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}
