/**
 * Moteur de reproduction du classeur Analyse_plans_rotation_2024_2025.xlsx.
 * Version : reproduction-2024-2025-v1.
 * Aucune dépendance à React, à un serveur ou à une bibliothèque de lecture XLSX.
 *
 * UTILISATION
 * 1. Lire les quatre feuilles XLSX en tableaux de lignes, en conservant les
 *    cellules vides (null), les nombres natifs et les lignes d'en-têtes.
 * 2. const inputs = parseWorkbookRows({ classrooms, personnel, schools, year5 });
 * 3. const result = simulateRotation(inputs);
 * 4. Afficher result.schools, pool, moves, regions, districts et controls.
 * 5. const rosters = buildSchoolRosters(inputs, result); pour la vue Année N / Année N+1.
 *
 * FEUILLES À LIRE, UNE FOIS CHACUNE
 * classrooms : base SALLES, PRIMAIRE, 1 ligne d'en-tête.
 * personnel  : base Personnel, 2024-2025, 1 ligne d'en-tête.
 * schools    : Base Ecole primaire, 2024_2025, 2 lignes d'en-têtes.
 * year5      : Base Année 5, TEPP (2), 1 ligne d'en-tête.
 * Ne pas cumuler les vues FRANCO/ANGLO ni TEPP (3), identique à TEPP (2).
 *
 * CONVENTIONS À CONSERVER POUR REPRODUIRE LE CLASSEUR
 * - Code école exact ; pas de rapprochement flou ni de suppression des accents.
 * - Ordre Public / Government seulement, selon la base salles.
 * - Besoin = salles utilisées - enseignants État de fonction 2, plancher zéro.
 * - Catégories État : 1, 2, 4. Directeurs et agents d'appui exclus du vivier.
 * - Ancienneté école > 5 et <= 60 ans ; plafond par école = excédent calculé.
 * - Région, ancienneté décroissante, ID source croissant pour le tri du vivier.
 * - Phase arrondissement complète, puis phase département pour les restants.
 * - Même sous-système scolaire ; inconnu = pas de mouvement.
 * - Demande territoriale recalculée après CHAQUE mouvement.
 * - Aucun âge, sexe, état matrimonial ou diagnostic médical n'entre dans le tri.
 * - La disponibilité DRH n'était pas renseignée : ceci reste une simulation.
 * - Le TEA est descriptif et ne commande pas l'affectation dans cette version.
 * - Année 5 sert uniquement au rapprochement, pas au calcul des besoins.
 * - ID_UNIQUE encode l'année et l'école d'origine : aucune trajectoire
 *   interannuelle réelle n'est disponible. La vue « Année N / Année N+1 »
 *   produite par buildSchoolRosters est une projection de cette simulation,
 *   pas l'observation de deux campagnes réelles.
 *
 * Les critères de la démarche non calculables (distances, permutations IAEB,
 * multigrade, demandes individuelles, quota officiel) ne sont pas implémentés.
 * Une nouvelle règle ou une nouvelle donnée impose de relancer la simulation.
 * Les filtres et tris de l'interface doivent porter sur une copie des résultats.
 */

export const ENGINE_VERSION = 'reproduction-2024-2025-v1';
export type Code = string;
export type Phase = 'Arrondissement' | 'Département';
export type Status = 'Calculable' | 'Personnel absent' | 'Salles invalides' | 'Géographie discordante';
export type Tea = { status: 'ok'; value: number } | { status: 'missing' | 'no-state-teacher'; value: null };
export interface Geography { region: string; department: string; district: string }
export interface Classroom extends Geography {
  code: Code; name: string; sector: string; area: string;
  totalRooms: number | null; usedRooms: number | null;
}
export interface Personnel extends Geography {
  id: string; schoolCode: Code; schoolName: string; functionCode: string; functionLabel: string;
  categoryCode: string; categoryLabel: string; schoolTenure: number | null;
}
export interface SchoolCensus {
  code: Code; sector: string; subsystem: string | null;
  pupils: number | null; stateTeachers: number | null; parentTeachers: number | null;
  pupilBoys: number | null; pupilGirls: number | null;
  stateMen: number | null; stateWomen: number | null;
}
export interface Year5 { code: Code; pupils: number | null; teachers: number | null }
export interface Inputs {
  classrooms: Classroom[]; personnel: Personnel[]; schools: SchoolCensus[]; year5: Year5[];
}
export interface SchoolResult extends Geography {
  code: Code; name: string; area: string; subsystem: string | null;
  totalRooms: number | null; usedRooms: number | null; personnelCount: number;
  stateTeachers: number; stateDirectors: number; parentTeachers: number;
  status: Status; initialNeed: number | null; excess: number; poolCapacity: number;
  departures: number; arrivals: number; teachersAfter: number;
  remainingNeed: number | null; remainingPool: number; coverageBefore: number | null;
  pupils: number | null; declaredStateTeachers: number | null; tea: Tea;
  stateIncludingDirectors: number; stateCountDifference: number | null;
  year5Pupils: number | null; year5Teachers: number | null; pupilDifference: number | null;
}
export interface Candidate {
  id: string; source: Code; tenure: number; category: string;
  destination: Code | null; phase: Phase | null;
}
export interface Move {
  order: number; teacherId: string; region: string;
  sourceDepartment: string; sourceDistrict: string; source: Code; sourceName: string;
  destinationDepartment: string; destinationDistrict: string; destination: Code;
  destinationName: string; tenure: number; phase: Phase; subsystem: string;
}
export interface Control { code: Code; name: string; reason: string; value1: number | null; value2: number | null }
export interface Summary extends Geography {
  schoolCount: number; calculableCount: number; initialNeed: number; pool: number;
  departures: number; arrivals: number; remainingNeed: number; remainingPool: number;
  teaSchoolCount: number; teaPupils: number; teaTeachers: number; aggregateTea: number | null;
}
export interface SimulationResult {
  version: string; schools: SchoolResult[]; pool: Candidate[]; moves: Move[];
  regions: Summary[]; districts: Summary[]; controls: Control[];
  totals: {
    publicSchools: number; personnel: number; calculableSchools: number; initialNeed: number;
    pool: number; moves: number; districtMoves: number; departmentMoves: number;
    remainingNeed: number; remainingPool: number; censusMatched: number; year5Matched: number;
    stateCountDifferences: number;
  };
}

const PUBLIC = 'Public / Government';
const STATE = new Set(['1', '2', '4']);
// Comparaison déterministe des chaînes, indépendante de la langue du navigateur.
// Ne pas remplacer par localeCompare pour les départages de l'algorithme.
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const text = (v: unknown): string => v == null ? '' : String(v);
const category = (v: unknown): string => text(v).split(' ')[0];
function code(v: unknown): Code {
  if (v == null || v === '') throw new Error('Code établissement vide');
  if (typeof v === 'number' && !Number.isSafeInteger(v)) throw new Error('Code numérique invalide');
  return String(v); // Préserve les zéros initiaux d'un identifiant déjà textuel.
}
function unique<T>(rows: T[], key: (v: T) => string, strict: boolean, source: string): Map<string,T> {
  const counts = new Map<string,number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  if (strict) for (const [id, count] of counts) if (count > 1) throw new Error(`${source} : doublon ${id}`);
  // Le rapprochement des deux bases complémentaires écarte les clés ambiguës.
  return new Map(rows.filter(r => counts.get(key(r)) === 1).map(r => [key(r), r]));
}
function group<T>(rows: T[], key: (r: T) => string): Map<string,T[]> {
  const result = new Map<string,T[]>();
  for (const row of rows) { const k = key(row); const a = result.get(k) ?? []; a.push(row); result.set(k,a); }
  return result;
}
export function calculateTea(pupils: number | null, teachers: number | null): Tea {
  if (pupils === null || teachers === null) return {status:'missing', value:null};
  if (teachers === 0) return {status:'no-state-teacher', value:null};
  return {status:'ok', value:pupils/teachers};
}

/** Adaptateur des feuilles brutes vers les types typés du moteur. */
export function parseWorkbookRows(raw: {
  classrooms: unknown[][]; personnel: unknown[][]; schools: unknown[][]; year5: unknown[][];
}): Inputs {
  function records(rows: unknown[][], required: string[]): Record<string,unknown>[] {
    const heads = (rows[0] ?? []).map(text);
    for (const name of required) if (!heads.includes(name)) throw new Error(`Colonne absente : ${name}`);
    return rows.slice(1).filter(r => r.some(v => v != null && v !== '')).map(r => Object.fromEntries(heads.map((h,i)=>[h,r[i] ?? null])));
  }
  const classrooms = records(raw.classrooms, ['CODE_ETABLISSEMENT','TYPE_ETABLISSEMENT','NB_SALLES_UTILISEES_COURS']).map(r=>({
    code:code(r.CODE_ETABLISSEMENT), name:text(r.NOM_ETABLISSEMENT), sector:text(r.TYPE_ETABLISSEMENT),
    region:text(r.REGION), department:text(r.DEPARTEMENT), district:text(r.ARRONDISSEMENT), area:text(r.MILIEU),
    totalRooms:num(r.NB_SALLES_CLASSE_TOTAL), usedRooms:num(r.NB_SALLES_UTILISEES_COURS)
  }));
  const personnel = records(raw.personnel, ['ID_UNIQUE','CODE_ETABLISSEMENT','ANNEE_SCOLAIRE','FONCTION','CATEGORIE_PROFESSIONNELLE','ANCIENNETE_ECOLE']).map(r=>{
    if (r.ANNEE_SCOLAIRE !== '2024-2025') throw new Error('Lire uniquement la feuille personnel 2024-2025');
    if (!r.ID_UNIQUE) throw new Error('ID_UNIQUE vide');
    return {id:text(r.ID_UNIQUE), schoolCode:code(r.CODE_ETABLISSEMENT), schoolName:text(r.NOM_ETABLISSEMENT),
      region:text(r.REGION), department:text(r.DEPARTEMENT), district:text(r.ARRONDISSEMENT),
      functionCode:category(r.FONCTION), functionLabel:text(r.FONCTION),
      categoryCode:category(r.CATEGORIE_PROFESSIONNELLE), categoryLabel:text(r.CATEGORIE_PROFESSIONNELLE),
      schoolTenure:num(r.ANCIENNETE_ECOLE)};
  });
  // Feuille 2024_2025 : en-têtes fusionnés et TOTAL répété. Utiliser les positions.
  if (raw.schools[0]?.[4] !== 'CODE_ETABLISSEMENT' || raw.schools[0]?.[6] !== 'ORDRE_ENSEIGNEMENT') {
    throw new Error('Structure inattendue : lire la feuille écoles 2024_2025, sans colonne de numéro ajoutée');
  }
  const schools = raw.schools.slice(2).filter(r=>r[4]!=null && r[4]!=='').map(r=>({
    code:code(r[4]), sector:text(r[6]), subsystem:r[5] == null ? null : text(r[5]),
    pupils:num(r[9]), stateTeachers:num(r[18]), parentTeachers:num(r[21]),
    pupilBoys:num(r[7]), pupilGirls:num(r[8]), stateMen:num(r[16]), stateWomen:num(r[17])
  }));
  // Écarter les lignes de total sans code : elles ne représentent pas des écoles.
  const year5 = records(raw.year5, ['CODE_ETABLISSEMENT','TOTAL ELEVES','TOTAL ENSEIGNANTS']).filter(r=>r.CODE_ETABLISSEMENT!=null&&r.CODE_ETABLISSEMENT!=='').map(r=>({
    code:code(r.CODE_ETABLISSEMENT), pupils:num(r['TOTAL ELEVES']), teachers:num(r['TOTAL ENSEIGNANTS'])
  }));
  return {classrooms, personnel, schools, year5};
}

export function simulateRotation(input: Inputs): SimulationResult {
  const classrooms = input.classrooms.filter(s=>s.sector===PUBLIC).sort((a,b)=>
    cmp(a.region,b.region)||cmp(a.department,b.department)||cmp(a.district,b.district)||cmp(a.code,b.code));
  unique(classrooms,s=>s.code,true,'Salles publiques');
  unique(input.personnel,p=>p.id,true,'Personnel');
  const bySchool = group(input.personnel,p=>p.schoolCode);
  const latest = unique(input.schools,s=>s.code,false,'Écoles récentes');
  for (const [key,s] of latest) if (s.sector!==PUBLIC) latest.delete(key);
  const old = unique(input.year5,s=>s.code,false,'Année 5');
  const pool: Candidate[] = []; const controls: Control[] = [];
  const schools: SchoolResult[] = classrooms.map(s=>{
    const staff = bySchool.get(s.code) ?? [];
    const state = staff.filter(p=>STATE.has(p.categoryCode)&&p.functionCode==='2');
    const directors = staff.filter(p=>STATE.has(p.categoryCode)&&p.functionCode==='1');
    const normal = (v:string)=>v.trim().toUpperCase();
    const conflict = staff.some(p=>normal(p.region)!==normal(s.region)||normal(p.department)!==normal(s.department)||normal(p.district)!==normal(s.district));
    const roomOK = s.usedRooms!==null && s.usedRooms>=0 && Number.isInteger(s.usedRooms);
    const status:Status = !staff.length ? 'Personnel absent' : conflict ? 'Géographie discordante' : !roomOK ? 'Salles invalides' : 'Calculable';
    const need = status==='Calculable' ? Math.max(s.usedRooms!-state.length,0) : null;
    const excess = status==='Calculable' && s.usedRooms!>0 ? Math.max(state.length-s.usedRooms!,0) : 0;
    const candidates = state.filter(p=>p.schoolTenure!==null && p.schoolTenure>5 && p.schoolTenure<=60)
      .sort((a,b)=>b.schoolTenure!-a.schoolTenure!||cmp(a.id,b.id));
    const capacity = Math.min(excess,candidates.length);
    for (const p of candidates.slice(0,capacity)) pool.push({id:p.id,source:s.code,tenure:p.schoolTenure!,category:p.categoryLabel,destination:null,phase:null});
    const recent = latest.get(s.code); const historic = old.get(s.code);
    const pupils=recent?.pupils??null, declared=recent?.stateTeachers??null, previous=historic?.pupils??null;
    if(status!=='Calculable') controls.push({code:s.code,name:s.name,reason:status,value1:staff.length,value2:s.usedRooms});
    if(recent && (recent.pupils!==(recent.pupilBoys??0)+(recent.pupilGirls??0) || declared!==(recent.stateMen??0)+(recent.stateWomen??0))) {
      controls.push({code:s.code,name:s.name,reason:'Totaux fichier école à contrôler',value1:declared,value2:pupils});
    }
    return {code:s.code,name:s.name,region:s.region,department:s.department,district:s.district,area:s.area,
      subsystem:recent?.subsystem??null,totalRooms:s.totalRooms,usedRooms:s.usedRooms,personnelCount:staff.length,
      stateTeachers:state.length,stateDirectors:directors.length,parentTeachers:staff.filter(p=>p.categoryCode==='3'&&p.functionCode==='2').length,
      status,initialNeed:need,excess,poolCapacity:capacity,departures:0,arrivals:0,teachersAfter:state.length,
      remainingNeed:need,remainingPool:capacity,coverageBefore:status==='Calculable'&&s.usedRooms!>0?state.length/s.usedRooms!:null,
      pupils,declaredStateTeachers:declared,tea:calculateTea(pupils,declared),stateIncludingDirectors:state.length+directors.length,
      stateCountDifference:declared===null?null:declared-state.length-directors.length,
      year5Pupils:previous,year5Teachers:historic?.teachers??null,pupilDifference:pupils===null||previous===null?null:pupils-previous};
  });
  const byCode = new Map(schools.map(s=>[s.code,s]));
  for (const [key,staff] of bySchool) if (!byCode.has(key)) controls.push({code:key,name:staff[0].schoolName,reason:'École personnel hors base publique salles',value1:staff.length,value2:null});
  pool.sort((a,b)=>cmp(byCode.get(a.source)!.region,byCode.get(b.source)!.region)||b.tenure-a.tenure||cmp(a.id,b.id));
  const moves: Move[] = [];
  for (const phase of ['Arrondissement','Département'] as const) {
    const groupKey=(s:SchoolResult)=>JSON.stringify(phase==='Arrondissement'
      ?[s.region,s.department,s.district,s.subsystem]:[s.region,s.department,s.subsystem]);
    const targetsByArea=group(schools.filter(s=>s.subsystem && (s.remainingNeed??0)>0),groupKey);
    for (const person of pool) {
      if (person.destination!==null) continue;
      const source=byCode.get(person.source)!;
      if (!source.subsystem) continue;
      const eligible=(targetsByArea.get(groupKey(source))??[]).filter(s=>(s.remainingNeed??0)>0);
      // Demande parmi les écoles compatibles de CE sous-système, pas le total tous sous-systèmes.
      const demand=new Map<string,number>();
      for(const s of eligible) demand.set(s.district,(demand.get(s.district)??0)+s.remainingNeed!);
      eligible.sort((a,b)=>demand.get(b.district)!-demand.get(a.district)!||b.remainingNeed!-a.remainingNeed!||cmp(a.code,b.code));
      const destination=eligible[0]; if(!destination) continue;
      person.destination=destination.code;person.phase=phase;
      source.departures++;source.remainingPool--;destination.arrivals++;destination.remainingNeed!--;
      moves.push({order:moves.length+1,teacherId:person.id,region:source.region,sourceDepartment:source.department,
        sourceDistrict:source.district,source:source.code,sourceName:source.name,destinationDepartment:destination.department,
        destinationDistrict:destination.district,destination:destination.code,destinationName:destination.name,
        tenure:person.tenure,phase,subsystem:source.subsystem});
    }
  }
  for(const s of schools) {
    s.teachersAfter=s.stateTeachers-s.departures+s.arrivals;
    if(s.stateCountDifference!==null&&s.stateCountDifference!==0) controls.push({code:s.code,name:s.name,reason:'État école différent du personnel avec directeurs',value1:s.declaredStateTeachers,value2:s.stateIncludingDirectors});
    if(s.pupils===null) controls.push({code:s.code,name:s.name,reason:'École absente du fichier effectifs 2024–2025',value1:null,value2:null});
    if(s.departures>s.poolCapacity||s.remainingPool<0||(s.departures>0&&s.stateTeachers-s.departures<s.usedRooms!)) throw new Error(`Départ invalide : ${s.code}`);
    if(s.initialNeed!==null&&(s.arrivals>s.initialNeed||s.remainingNeed!==s.initialNeed-s.arrivals)) throw new Error(`Arrivée invalide : ${s.code}`);
  }
  if(new Set(moves.map(m=>m.teacherId)).size!==moves.length) throw new Error('Double affectation');
  if(schools.reduce((n,s)=>n+s.departures,0)!==moves.length||schools.reduce((n,s)=>n+s.arrivals,0)!==moves.length) throw new Error('Départs et arrivées non équilibrés');
  const regions=summarize(schools,'region');const districts=summarize(schools,'district');
  return {version:ENGINE_VERSION,schools,pool,moves,regions,districts,controls,totals:{
    publicSchools:schools.length,personnel:input.personnel.length,calculableSchools:schools.filter(s=>s.status==='Calculable').length,
    initialNeed:schools.reduce((n,s)=>n+(s.initialNeed??0),0),pool:pool.length,moves:moves.length,
    districtMoves:moves.filter(m=>m.phase==='Arrondissement').length,departmentMoves:moves.filter(m=>m.phase==='Département').length,
    remainingNeed:schools.reduce((n,s)=>n+(s.remainingNeed??0),0),remainingPool:pool.filter(p=>p.destination===null).length,
    censusMatched:schools.filter(s=>s.pupils!==null).length,year5Matched:schools.filter(s=>s.year5Pupils!==null).length,
    stateCountDifferences:schools.filter(s=>s.stateCountDifference!==null&&s.stateCountDifference!==0).length
  }};
}

function summarize(schools:SchoolResult[],level:'region'|'district'):Summary[] {
  const groups=group(schools,s=>JSON.stringify(level==='region'?[s.region]:[s.region,s.department,s.district]));
  const result:Summary[]=[];
  for(const rows of groups.values()) {
    const first=rows[0];const teaRows=rows.filter(s=>s.pupils!==null&&s.declaredStateTeachers!==null);
    const pupils=teaRows.reduce((n,s)=>n+s.pupils!,0),teachers=teaRows.reduce((n,s)=>n+s.declaredStateTeachers!,0);
    result.push({region:first.region,department:level==='district'?first.department:'',district:level==='district'?first.district:'',
      schoolCount:rows.length,calculableCount:rows.filter(s=>s.status==='Calculable').length,
      initialNeed:rows.reduce((n,s)=>n+(s.initialNeed??0),0),pool:rows.reduce((n,s)=>n+s.poolCapacity,0),
      departures:rows.reduce((n,s)=>n+s.departures,0),arrivals:rows.reduce((n,s)=>n+s.arrivals,0),
      remainingNeed:rows.reduce((n,s)=>n+(s.remainingNeed??0),0),remainingPool:rows.reduce((n,s)=>n+s.remainingPool,0),
      teaSchoolCount:teaRows.length,teaPupils:pupils,teaTeachers:teachers,aggregateTea:teachers>0?pupils/teachers:null});
  }
  return result.sort((a,b)=>cmp(a.region,b.region)||(level==='district'?b.initialNeed-a.initialNeed||cmp(a.district,b.district)||cmp(a.department,b.department):0));
}

// Valeurs de recette pour les quatre fichiers fournis, sans modification :
export const EXPECTED_TOTALS = {
  publicSchools:13494,personnel:69036,calculableSchools:13119,initialNeed:26635,
  pool:3090,moves:1880,districtMoves:1331,departmentMoves:549,remainingNeed:24755,
  remainingPool:1210,censusMatched:12583,year5Matched:13311,stateCountDifferences:76
} as const;

// ---------------------------------------------------------------------------
// Vue « Année N / Année N+1 » par école (effectifs avant / après simulation).
// ---------------------------------------------------------------------------

/** Rôle affiché pour un agent, dérivé de FONCTION (1 Directeur, 2 Enseignant, sinon le libellé brut). */
export function roleLabel(p: Pick<Personnel,'functionCode'|'functionLabel'>): string {
  if (p.functionCode === '1') return 'Directeur';
  if (p.functionCode === '2') return 'Enseignant';
  return p.functionLabel || `Fonction ${p.functionCode || 'inconnue'}`;
}

export interface RosterMovement {
  phase: Phase; schoolCode: Code; schoolName: string;
}
export interface RosterEntry {
  id: string; role: string; category: string; tenure: number | null;
  /** Renseigné côté Année N pour un agent qui part : l'école de destination. */
  departsTo: RosterMovement | null;
  /** Renseigné côté Année N+1 pour un agent qui arrive : l'école d'origine. */
  arrivesFrom: RosterMovement | null;
}
export interface RosterSchool extends Geography {
  code: Code; name: string;
  before: RosterEntry[]; // Année N : effectif déclaré, tel quel.
  after: RosterEntry[];  // Année N+1 : effectif après simulation (départs retirés, arrivées ajoutées).
}

/**
 * Construit, pour chaque école, la liste des agents à l'Année N et la même
 * liste projetée à l'Année N+1 : un enseignant affecté ailleurs disparaît de
 * son école d'origine et apparaît dans son école de destination.
 * Seuls les enseignants du vivier (fonction 2, État) sont mobiles ; les
 * directeurs et les autres agents restent inchangés entre les deux colonnes.
 */
export function buildSchoolRosters(input: Inputs, result: Pick<SimulationResult,'schools'|'moves'>): RosterSchool[] {
  const bySchool = group(input.personnel, p => p.schoolCode);
  const moveBySource = new Map(result.moves.map(m => [m.teacherId, m]));
  const movesByDestination = group(result.moves, m => m.destination);
  const order = (a: RosterEntry, b: RosterEntry) =>
    (a.role === 'Directeur' ? 0 : a.role === 'Enseignant' ? 1 : 2) - (b.role === 'Directeur' ? 0 : b.role === 'Enseignant' ? 1 : 2)
    || (b.tenure ?? -1) - (a.tenure ?? -1) || cmp(a.id, b.id);

  return result.schools.map(school => {
    const staff = bySchool.get(school.code) ?? [];
    const before: RosterEntry[] = staff.map(p => {
      const move = moveBySource.get(p.id);
      const departsTo = move && move.source === school.code
        ? { phase: move.phase, schoolCode: move.destination, schoolName: move.destinationName }
        : null;
      return { id: p.id, role: roleLabel(p), category: p.categoryLabel, tenure: p.schoolTenure, departsTo, arrivesFrom: null };
    }).sort(order);

    const stayed = before.filter(e => e.departsTo === null);
    const arrivals = (movesByDestination.get(school.code) ?? []).map<RosterEntry>(m => ({
      id: m.teacherId, role: 'Enseignant', category: '', tenure: m.tenure,
      departsTo: null, arrivesFrom: { phase: m.phase, schoolCode: m.source, schoolName: m.sourceName }
    }));
    const after = [...stayed, ...arrivals].sort(order);

    return { code: school.code, name: school.name, region: school.region, department: school.department, district: school.district, before, after };
  });
}
