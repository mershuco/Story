import rules from "../data/2022.json";
import drafts from "../data/players.json";
import { POSITIONS, STRATEGIES, TRAINING } from "./types";
import type { Game, Team, Player, Match, Standing, Position } from "./types";
export { rules };
const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export function random(g: Game): number {
  g.rng = (Math.imul(g.rng, 1664525) + 1013904223) >>> 0;
  return g.rng / 4294967296;
}
export function roster(g: Game, id: string, squad: Player["squad"] = "first") {
  return g.players.filter((p) => p.teamId === id && p.squad === squad);
}
export function payroll(g: Game, id: string) {
  return round(
    g.players.filter((p) => p.teamId === id).reduce((s, p) => s + p.salary, 0) +
      g.teams.find((t) => t.id === id)!.staff.reduce((s, p) => s + p.salary, 0),
  );
}
export function obligations(g: Game, id: string) {
  return round(
    g.players
      .filter((p) => p.teamId === id)
      .reduce((s, p) => s + p.salary * p.years, 0) +
      g.teams.find((t) => t.id === id)!.staff.reduce((s, p) => s + p.salary, 0),
  );
}
function event(g: Game, cause: string, message: string) {
  g.events.push({ id: `e${g.events.length}`, date: g.date, cause, message });
}
function money(
  g: Game,
  teamId: string,
  amount: number,
  category: Game["ledger"][number]["category"],
  description: string,
) {
  amount = round(amount);
  const t = g.teams.find((t) => t.id === teamId)!;
  if (t.cash + amount < -0.001) throw Error("구단의 현금이 부족합니다.");
  t.cash = round(t.cash + amount);
  g.ledger.push({
    id: `l${g.ledger.length}`,
    teamId,
    amount: round(amount),
    category,
    description,
  });
}
export function createGame(teamId: string, seed = 2022): Game {
  if (!rules.organizations.some((t) => t.id === teamId))
    throw Error("LCK 구단을 선택해 주세요.");
  const teams: Team[] = rules.organizations.map((t) => ({
    ...t,
    initialCash: t.cash,
    teamwork: 70,
    strategy: "균형",
    staff: [
      {
        id: `${t.id}-head`,
        name: `${t.short} 감독`,
        role: "head",
        ability: t.rating,
        salary: 0.8,
      },
      {
        id: `${t.id}-coach`,
        name: `${t.short} 코치`,
        role: "coach",
        ability: t.rating - 2,
        salary: 0.5,
      },
    ],
  }));
  const players: Player[] = [];
  for (const [i, t] of rules.organizations.entries())
    for (const squad of ["first", "academy"] as const)
      for (const [j, position] of POSITIONS.entries()) {
        const ovr =
          t.rating + ((j * 3 + i) % 7) - 3 - (squad === "academy" ? 14 : 0);
        players.push({
          id: `${t.id}-${squad}-${position}`,
          name: `${t.short} ${squad === "academy" ? "Rookie" : "Origin"}-${j + 1}`,
          position,
          ovr,
          potential: Math.min(99, ovr + 8 + ((i + j) % 10)),
          salary: squad === "first" ? 1.2 : 0.25,
          years: 1,
          teamId: t.id,
          squad,
          training: "약점 보완",
          sourceStatus: "simulated",
          historicalContractEnd: null,
        });
      }
  const names = new Set<string>();
  for (const [i, p] of drafts.entries())
    if (!names.has(p.name.toLowerCase())) {
      names.add(p.name.toLowerCase());
      players.push({
        id: `draft-${i}`,
        name: p.name,
        position: p.position as Position,
        ovr: p.ovr,
        potential: p.potential,
        salary: round(Math.max(0.35, (p.ovr - 50) / 9)),
        years: 0,
        teamId: null,
        squad: "market",
        training: "약점 보완",
        sourceStatus: "simulated",
        historicalContractEnd: null,
      });
    }
  const g: Game = {
    version: 1,
    rulesId: rules.id,
    seed: seed >>> 0,
    rng: seed >>> 0,
    teamId,
    date: rules.startDate,
    phase: "offseason",
    teams,
    players,
    matches: [],
    ledger: [],
    events: [],
    reports: [],
    staffReports: [],
    seeds: [],
    champion: null,
    aiDone: false,
  };
  event(
    g,
    "start",
    "2022 스프링 시범 세계를 시작했습니다. 초기 선수단·계약은 가상이며 실제 스토브리그 로스터가 아닙니다.",
  );
  return g;
}
function offseason(g: Game) {
  if (g.phase !== "offseason")
    throw Error("대회가 시작되어 계약·등록·훈련 설정이 잠겼습니다.");
}
export function signPlayer(
  game: Game,
  teamId: string,
  playerId: string,
  salary: number,
  years: number,
): Game {
  offseason(game);
  const g = structuredClone(game);
  const t = g.teams.find((t) => t.id === teamId);
  const p = g.players.find((p) => p.id === playerId);
  if (!t || !p || p.teamId !== null)
    throw Error("현재 FA 선수만 영입할 수 있습니다.");
  if (
    !Number.isFinite(salary) ||
    salary < p.salary ||
    !Number.isInteger(years) ||
    years < 1 ||
    years > 3
  )
    throw Error("희망 연봉 이상, 계약 기간 1~3년으로 제안해 주세요.");
  const bonus = round(salary * 0.2);
  const commitment = salary * years;
  if (t.cash - bonus < obligations(g, teamId) + commitment)
    throw Error("기존 계약과 새 계약을 모두 보장할 현금이 부족합니다.");
  money(g, teamId, -bonus, "signing", `${p.name} 계약금`);
  p.teamId = teamId;
  p.salary = salary;
  p.years = years;
  p.squad = "academy";
  event(
    g,
    "sign",
    `${t.short}: ${p.name} ${years}년 계약, 연봉 ${salary.toFixed(2)}억 원. 2군에 합류했습니다.`,
  );
  assertWorld(g);
  return g;
}
export function promote(game: Game, playerId: string): Game {
  offseason(game);
  const g = structuredClone(game);
  const p = g.players.find((p) => p.id === playerId);
  if (!p || p.teamId !== g.teamId || p.squad !== "academy")
    throw Error("우리 구단 2군 선수만 콜업할 수 있습니다.");
  const current = roster(g, g.teamId).find((x) => x.position === p.position)!;
  current.squad = "academy";
  p.squad = "first";
  event(
    g,
    "promote",
    `${p.name} 1군 콜업 · ${current.name} 2군 이동. 두 선수의 계약은 유지됩니다.`,
  );
  assertWorld(g);
  return g;
}
export function setPreparation(
  game: Game,
  strategy: string,
  training: Record<string, string>,
): Game {
  offseason(game);
  if (!STRATEGIES.includes(strategy as (typeof STRATEGIES)[number]))
    throw Error("전략을 확인해 주세요.");
  const g = structuredClone(game);
  g.teams.find((t) => t.id === g.teamId)!.strategy = strategy;
  for (const p of roster(g, g.teamId))
    if (training[p.id]) {
      if (!TRAINING.includes(training[p.id] as (typeof TRAINING)[number]))
        throw Error("훈련 방향을 확인해 주세요.");
      p.training = training[p.id];
    }
  return g;
}
export function hireStaff(
  game: Game,
  role: "head" | "coach",
  ability: number,
): Game {
  offseason(game);
  if (![76, 84, 92].includes(ability))
    throw Error("지도자 후보를 확인해 주세요.");
  const g = structuredClone(game),
    t = g.teams.find((t) => t.id === g.teamId)!,
    old = t.staff.find((s) => s.role === role)!;
  const salary = round((ability - 60) / 8),
    bonus = round(salary * 0.2);
  if (t.cash - bonus < obligations(g, t.id) - old.salary + salary)
    throw Error("지도자 계약을 보장할 현금이 부족합니다.");
  money(g, t.id, -bonus, "signing", "지도자 계약금");
  t.staff = t.staff.filter((s) => s.role !== role);
  t.staff.push({
    id: `${t.id}-${role}-${g.events.length}`,
    name: `${ability >= 90 ? "명장" : ability >= 80 ? "전문" : "육성"} ${role === "head" ? "감독" : "코치"}`,
    role,
    ability,
    salary,
  });
  event(g, "staff", "새 지도자가 스프링 대회를 준비합니다.");
  return g;
}
export function strength(g: Game, id: string): number {
  const t = g.teams.find((t) => t.id === id)!,
    ps = roster(g, id),
    avg = ps.reduce((s, p) => s + p.ovr, 0) / 5;
  const focus: Record<string, Position[]> = {
    "상체 중심": ["TOP", "JGL"],
    "미드 중심": ["MID"],
    "바텀 중심": ["BOT", "SUP"],
  };
  const target = focus[t.strategy];
  const strategy = target
    ? ps
        .filter((p) => target.includes(p.position))
        .reduce((s, p) => s + p.ovr, 0) / target.length
    : t.strategy === "균형"
      ? 78
      : 76 +
        ps.filter((p) => p.training === "메타 연구" || p.training === "운영")
          .length;
  return (
    avg * rules.playerWeight +
    t.staff.find((s) => s.role === "head")!.ability * rules.headCoachWeight +
    t.staff.find((s) => s.role === "coach")!.ability * rules.coachWeight +
    t.teamwork * rules.teamworkWeight +
    strategy * rules.strategyWeight +
    75 * rules.metaWeight +
    (75 + ps.filter((p) => p.training === "컨디션 관리").length * 3) *
      rules.conditionWeight
  );
}
function match(
  g: Game,
  home: string,
  away: string,
  phase: Match["phase"],
  bestOf: number,
): Match {
  let h = 0,
    a = 0;
  const needed = Math.ceil(bestOf / 2);
  while (h < needed && a < needed) {
    const diff = strength(g, home) - strength(g, away) + (random(g) - 0.5) * 4;
    const p = clamp(1 / (1 + Math.exp(-diff / 8)), 0.02, 0.98);
    if (random(g) < p) h++;
    else a++;
  }
  const m: Match = {
    id: `m${g.matches.length}`,
    phase,
    home,
    away,
    homeScore: h,
    awayScore: a,
    winner: h > a ? home : away,
  };
  g.matches.push(m);
  return m;
}
export function standings(g: Game): Standing[] {
  const rows = g.teams.map((t) => ({
    teamId: t.id,
    wins: 0,
    losses: 0,
    setsFor: 0,
    setsAgainst: 0,
    differential: 0,
  }));
  for (const m of g.matches.filter((m) => m.phase === "regular")) {
    const h = rows.find((r) => r.teamId === m.home)!,
      a = rows.find((r) => r.teamId === m.away)!;
    h.setsFor += m.homeScore;
    h.setsAgainst += m.awayScore;
    a.setsFor += m.awayScore;
    a.setsAgainst += m.homeScore;
    rows.find((r) => r.teamId === m.winner)!.wins++;
    rows.find(
      (r) => r.teamId !== m.winner && [m.home, m.away].includes(r.teamId),
    )!.losses++;
  }
  for (const r of rows) r.differential = r.setsFor - r.setsAgainst;
  const headToHead = (a: string, b: string) =>
    g.matches
      .filter(
        (m) =>
          m.phase === "regular" &&
          [m.home, m.away].includes(a) &&
          [m.home, m.away].includes(b),
      )
      .reduce((s, m) => s + (m.winner === a ? 1 : -1), 0);
  // Resolve tied groups together; do not use a non-transitive pairwise comparator.
  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.differential - a.differential ||
      a.teamId.localeCompare(b.teamId),
  );
  const result: Standing[] = [];
  while (rows.length) {
    const first = rows.shift()!;
    const group = [first];
    while (
      rows.length &&
      rows[0].wins === first.wins &&
      rows[0].differential === first.differential
    )
      group.push(rows.shift()!);
    const score = (id: string) =>
      group.reduce(
        (s, r) => s + (r.teamId === id ? 0 : headToHead(id, r.teamId)),
        0,
      );
    group.sort(
      (a, b) =>
        score(b.teamId) - score(a.teamId) || a.teamId.localeCompare(b.teamId),
    );
    result.push(...group);
  }
  return result;
}
function evaluate(g: Game, phase: string, matches: Match[]) {
  for (const t of g.teams) {
    const played = matches.filter((m) => m.home === t.id || m.away === t.id);
    if (!played.length) continue;
    const wins = played.filter((m) => m.winner === t.id).length;
    const rate = wins / played.length;
    for (const p of roster(g, t.id)) {
      const relative =
        p.ovr - roster(g, t.id).reduce((s, x) => s + x.ovr, 0) / 5;
      const rating = round(
        clamp(
          5.5 + rate * 2.5 + relative * 0.035 + (random(g) - 0.5) * 1.2,
          3,
          10,
        ),
      );
      const growth = round(
        Math.min(
          p.potential - p.ovr,
          Math.max(
            0,
            (p.potential - p.ovr) * 0.02 * (0.6 + rate) +
              (p.training === "약점 보완" ? 0.12 : 0.05),
          ),
        ),
      );
      const kills = Math.round(
        played.length * (2 + rate * 3 + (p.position === "BOT" ? 1 : 0)),
      );
      const deaths = Math.max(1, Math.round(played.length * (4 - rate * 2)));
      const assists = Math.round(
        played.length * (5 + rate * 4 + (p.position === "SUP" ? 3 : 0)),
      );
      g.reports.push({
        phase,
        playerId: p.id,
        name: p.name,
        rating,
        stars: Math.round((p.ovr / 20) * 2) / 2,
        potentialStars: Math.round((p.potential / 20) * 2) / 2,
        kda: `${kills} / ${deaths} / ${assists}`,
        growth,
        comment:
          rating >= 7.5
            ? "기대를 넘어선 활약. 다음 무대가 기대됩니다."
            : rating >= 6
              ? "제 역할을 해냈습니다. 훈련으로 한 단계 더 성장할 수 있습니다."
              : "아쉬운 대회. 약점 보완과 컨디션 관리가 필요합니다.",
        value: round((p.ovr * p.ovr) / 600),
        efficiency: round(rating / p.salary),
      });
      p.ovr = round(Math.min(p.potential, p.ovr + growth));
    }
    for (const s of t.staff) {
      const rating = round(clamp(4 + rate * 4 + (s.ability - 70) / 20, 1, 10));
      g.staffReports.push({
        phase,
        staffId: s.id,
        name: s.name,
        role: s.role,
        rating,
        comment:
          s.role === "head"
            ? `전술·밴픽 지도력 ${s.ability} · 담당 ${played.length}경기 ${wins}승`
            : `육성 지도력 ${s.ability} · 선수 훈련과 대회 성과 반영`,
      });
    }
  }
}
export function runRegular(game: Game): Game {
  offseason(game);
  assertWorld(game);
  // AI uses the exact same acceptance and affordability rules as the user.
  let g = structuredClone(game);
  if (!g.aiDone) {
    for (const t of g.teams.filter((t) => t.id !== g.teamId)) {
      const candidate = g.players
        .filter(
          (p) =>
            p.teamId === null &&
            p.ovr > Math.min(...roster(g, t.id).map((p) => p.ovr)),
        )
        .sort((a, b) => b.ovr - a.ovr || a.id.localeCompare(b.id))[0];
      if (candidate) {
        try {
          g = signPlayer(g, t.id, candidate.id, candidate.salary, 1);
          const p = g.players.find((p) => p.id === candidate.id)!,
            old = roster(g, t.id).find((x) => x.position === p.position)!;
          old.squad = "academy";
          p.squad = "first";
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("현금"))
            throw error;
        }
      }
    }
    g.aiDone = true;
  }
  for (const t of g.teams)
    if (t.cash < payroll(g, t.id) / 2)
      throw Error(`${t.short} 구단의 스프링 급여 예산이 부족합니다.`);
  g.date = rules.regularDate;
  for (const t of g.teams)
    money(
      g,
      t.id,
      -payroll(g, t.id) / 2,
      "salary",
      "스프링 선수단·지도자 급여 (연봉 50%)",
    );
  for (let leg = 0; leg < rules.roundRobins; leg++)
    for (let i = 0; i < g.teams.length; i++)
      for (let j = i + 1; j < g.teams.length; j++)
        match(
          g,
          g.teams[leg === 0 ? i : j].id,
          g.teams[leg === 0 ? j : i].id,
          "regular",
          rules.regularBestOf,
        );
  g.seeds = standings(g)
    .slice(0, rules.playoffTeams)
    .map((r) => r.teamId);
  evaluate(g, "정규시즌", g.matches);
  g.phase = "quarter";
  g.date = rules.playoffsDate;
  event(
    g,
    "regular",
    "정규시즌 90경기 종료. 상위 6팀이 플레이오프에 진출했습니다.",
  );
  assertWorld(g);
  return g;
}
export function runPlayoff(game: Game): Game {
  if (!["quarter", "semi", "final"].includes(game.phase))
    throw Error("진행할 플레이오프 라운드가 없습니다.");
  const g = structuredClone(game);
  const start = g.matches.length;
  if (g.phase === "quarter") {
    match(g, g.seeds[2], g.seeds[5], "quarter", rules.playoffBestOf);
    match(g, g.seeds[3], g.seeds[4], "quarter", rules.playoffBestOf);
    g.phase = "semi";
  } else if (g.phase === "semi") {
    const winners = g.matches
      .filter((m) => m.phase === "quarter")
      .map((m) => m.winner)
      .sort((a, b) => g.seeds.indexOf(b) - g.seeds.indexOf(a));
    match(g, g.seeds[0], winners[0], "semi", rules.playoffBestOf);
    match(g, g.seeds[1], winners[1], "semi", rules.playoffBestOf);
    g.phase = "final";
  } else {
    const finalists = g.matches
      .filter((m) => m.phase === "semi")
      .map((m) => m.winner);
    const m = match(
      g,
      finalists[0],
      finalists[1],
      "final",
      rules.playoffBestOf,
    );
    g.champion = m.winner;
    g.phase = "complete";
    g.date = rules.finalDate;
    money(g, m.winner, rules.prizes[0], "prize", "스프링 우승 상금 (가상)");
    money(
      g,
      m.winner === m.home ? m.away : m.home,
      rules.prizes[1],
      "prize",
      "스프링 준우승 상금 (가상)",
    );
    for (const semi of g.matches.filter((x) => x.phase === "semi"))
      money(
        g,
        semi.winner === semi.home ? semi.away : semi.home,
        rules.prizes[2],
        "prize",
        "스프링 공동 3위 상금 (가상)",
      );
  }
  const names = {
    quarter: "플레이오프 1라운드",
    semi: "플레이오프 4강",
    final: "플레이오프 결승",
  };
  const label = names[game.phase as keyof typeof names];
  evaluate(g, label, g.matches.slice(start));
  event(
    g,
    "playoff",
    `${label} 종료${g.champion ? ` · ${g.teams.find((t) => t.id === g.champion)!.name} 우승` : ""}.`,
  );
  assertWorld(g);
  return g;
}
export function assertWorld(g: Game) {
  if (new Set(g.players.map((p) => p.id)).size !== g.players.length)
    throw Error("선수 ID가 중복되었습니다.");
  for (const t of g.teams) {
    const ps = roster(g, t.id);
    if (
      ps.length !== 5 ||
      POSITIONS.some((pos) => ps.filter((p) => p.position === pos).length !== 1)
    )
      throw Error("1군은 포지션별 한 명, 정확히 5명이어야 합니다.");
    if (!Number.isFinite(t.cash) || t.cash < 0)
      throw Error("재정 데이터가 올바르지 않습니다.");
  }
}
