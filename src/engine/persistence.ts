import { openDB } from "idb";
import { assertWorld, createGame, rules } from "./game";
import { POSITIONS, STRATEGIES, TRAINING } from "./types";
import type { Game } from "./types";
const expectedPlayers = new Set(createGame("t1").players.map((p) => p.id));
const phases = ["offseason", "quarter", "semi", "final", "complete"];
export function serialize(game: Game): string {
  return JSON.stringify(game);
}
export function deserialize(text: string): Game {
  let g: Game;
  try {
    g = JSON.parse(text);
    if (
      !g ||
      g.version !== 1 ||
      g.rulesId !== rules.id ||
      !phases.includes(g.phase) ||
      !Number.isInteger(g.rng) ||
      !Number.isInteger(g.seed) ||
      g.rng < 0 ||
      g.rng > 4294967295 ||
      !/^202[12]-\d{2}-\d{2}$/.test(g.date) ||
      typeof g.aiDone !== "boolean"
    )
      throw Error();
    const ids = rules.organizations.map((t) => t.id);
    if (
      !ids.includes(g.teamId) ||
      !Array.isArray(g.teams) ||
      g.teams.length !== 10 ||
      new Set(g.teams.map((t) => t.id)).size !== 10 ||
      g.teams.some(
        (t) =>
          !ids.includes(t.id) ||
          typeof t.name !== "string" ||
          typeof t.short !== "string" ||
          !/^#[\da-f]{6}$/i.test(t.color) ||
          !Number.isFinite(t.cash) ||
          !Number.isFinite(t.initialCash) ||
          !Number.isFinite(t.teamwork) ||
          !STRATEGIES.includes(t.strategy as (typeof STRATEGIES)[number]) ||
          !Array.isArray(t.staff) ||
          t.staff.length !== 2 ||
          ["head", "coach"].some(
            (role) => t.staff.filter((s) => s.role === role).length !== 1,
          ) ||
          t.staff.some(
            (s) =>
              typeof s.id !== "string" ||
              typeof s.name !== "string" ||
              !Number.isFinite(s.ability) ||
              s.ability < 1 ||
              s.ability > 100 ||
              !Number.isFinite(s.salary) ||
              s.salary < 0,
          ),
      )
    )
      throw Error();
    if (
      !Array.isArray(g.players) ||
      g.players.length !== expectedPlayers.size ||
      g.players.some(
        (p) =>
          !expectedPlayers.has(p.id) ||
          typeof p.id !== "string" ||
          typeof p.name !== "string" ||
          !POSITIONS.includes(p.position) ||
          !Number.isFinite(p.ovr) ||
          p.ovr < 1 ||
          p.ovr > 100 ||
          !Number.isFinite(p.potential) ||
          p.potential < p.ovr ||
          p.potential > 100 ||
          !Number.isFinite(p.salary) ||
          p.salary < 0 ||
          !Number.isInteger(p.years) ||
          p.years < 0 ||
          p.years > 3 ||
          p.sourceStatus !== "simulated" ||
          p.historicalContractEnd !== null ||
          !TRAINING.includes(p.training as (typeof TRAINING)[number]) ||
          !["first", "academy", "market"].includes(p.squad) ||
          (p.teamId === null
            ? p.squad !== "market" || p.years !== 0
            : !ids.includes(p.teamId) || p.squad === "market" || p.years === 0),
      )
    )
      throw Error();
    if (
      !Array.isArray(g.matches) ||
      g.matches.length > 95 ||
      g.matches.some(
        (m) =>
          typeof m.id !== "string" ||
          !["regular", "quarter", "semi", "final"].includes(m.phase) ||
          !ids.includes(m.home) ||
          !ids.includes(m.away) ||
          m.home === m.away ||
          !Number.isInteger(m.homeScore) ||
          !Number.isInteger(m.awayScore) ||
          Math.min(m.homeScore, m.awayScore) < 0 ||
          Math.max(m.homeScore, m.awayScore) !==
            (m.phase === "regular" ? 2 : 3) ||
          m.homeScore === m.awayScore ||
          m.winner !== (m.homeScore > m.awayScore ? m.home : m.away),
      )
    )
      throw Error();
    const expected = {
      offseason: [0, 0, 0, 0],
      quarter: [90, 0, 0, 0],
      semi: [90, 2, 0, 0],
      final: [90, 2, 2, 0],
      complete: [90, 2, 2, 1],
    }[g.phase];
    if (
      ["regular", "quarter", "semi", "final"].some(
        (p, i) => g.matches.filter((m) => m.phase === p).length !== expected[i],
      )
    )
      throw Error();
    if (
      !Array.isArray(g.seeds) ||
      new Set(g.seeds).size !== g.seeds.length ||
      g.seeds.some((id) => !ids.includes(id)) ||
      g.seeds.length !== (g.phase === "offseason" ? 0 : 6) ||
      (g.phase === "complete"
        ? !ids.includes(g.champion ?? "")
        : g.champion !== null)
    )
      throw Error();
    if (
      !Array.isArray(g.ledger) ||
      g.ledger.some(
        (l) =>
          typeof l.id !== "string" ||
          !ids.includes(l.teamId) ||
          !Number.isFinite(l.amount) ||
          !["salary", "signing", "prize"].includes(l.category) ||
          typeof l.description !== "string",
      ) ||
      !Array.isArray(g.events) ||
      g.events.some(
        (e) =>
          typeof e.id !== "string" ||
          typeof e.date !== "string" ||
          typeof e.cause !== "string" ||
          typeof e.message !== "string",
      )
    )
      throw Error();
    if (
      !Array.isArray(g.reports) ||
      g.reports.some(
        (r) =>
          !g.players.some((p) => p.id === r.playerId) ||
          typeof r.phase !== "string" ||
          typeof r.name !== "string" ||
          typeof r.comment !== "string" ||
          typeof r.kda !== "string" ||
          [
            r.rating,
            r.stars,
            r.potentialStars,
            r.growth,
            r.value,
            r.efficiency,
          ].some((n) => !Number.isFinite(n)),
      ) ||
      !Array.isArray(g.staffReports) ||
      g.staffReports.some(
        (r) =>
          typeof r.staffId !== "string" ||
          typeof r.name !== "string" ||
          typeof r.phase !== "string" ||
          typeof r.role !== "string" ||
          typeof r.comment !== "string" ||
          !Number.isFinite(r.rating),
      )
    )
      throw Error();
    assertWorld(g);
  } catch {
    throw Error(
      "지원하지 않거나 손상된 저장 파일입니다. 현재 게임은 유지됩니다.",
    );
  }
  return g;
}
const db = () =>
  openDB("lck-manager", 1, {
    upgrade(db) {
      db.createObjectStore("saves");
    },
  });
export async function saveGame(g: Game) {
  await (await db()).put("saves", serialize(g), "autosave");
}
export async function loadGame(): Promise<Game | null> {
  const value = await (await db()).get("saves", "autosave");
  return value ? deserialize(value) : null;
}
