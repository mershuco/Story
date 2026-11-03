import { describe, expect, it } from "vitest";
import {
  assertWorld,
  createGame,
  hireStaff,
  obligations,
  payroll,
  promote,
  roster,
  runPlayoff,
  runRegular,
  setPreparation,
  signPlayer,
  standings,
} from "../src/engine/game";
import { deserialize, serialize } from "../src/engine/persistence";
import { POSITIONS } from "../src/engine/types";
const completed = () => {
  let g = runRegular(createGame("t1", 42));
  for (let i = 0; i < 3; i++) g = runPlayoff(g);
  return g;
};
describe("regular season and reproducibility", () => {
  it("simulates exactly 90 BO3 matches, 18 per team and each pairing twice, then stops", () => {
    const start = createGame("t1"),
      g = runRegular(start);
    expect(start.matches).toHaveLength(0);
    expect(g.phase).toBe("quarter");
    expect(g.matches).toHaveLength(90);
    for (const t of g.teams) {
      expect(
        g.matches.filter((m) => m.home === t.id || m.away === t.id),
      ).toHaveLength(18);
      for (const other of g.teams.filter((o) => o.id !== t.id))
        expect(
          g.matches.filter(
            (m) =>
              [m.home, m.away].includes(t.id) &&
              [m.home, m.away].includes(other.id),
          ),
        ).toHaveLength(2);
    }
    for (const m of g.matches) {
      expect(Math.max(m.homeScore, m.awayScore)).toBe(2);
      expect(Math.min(m.homeScore, m.awayScore)).toBeLessThan(2);
    }
    expect(standings(g).reduce((s, r) => s + r.wins, 0)).toBe(90);
    expect(standings(g).reduce((s, r) => s + r.differential, 0)).toBe(0);
    expect(g.seeds).toHaveLength(6);
    expect(() => runRegular(g)).toThrow();
  });
  it("reproduces full tournaments and preserves input immutability", () => {
    expect(completed()).toEqual(completed());
    const a = runRegular(createGame("t1", 1)),
      b = runRegular(createGame("t1", 2));
    expect(a.matches).not.toEqual(b.matches);
  });
  it("applies training and strategy before the tournament and locks them during it", () => {
    const g = createGame("t1");
    const id = roster(g, "t1")[0].id;
    const prep = setPreparation(g, "상체 중심", { [id]: "라인전" });
    expect(prep.teams[0].strategy).toBe("상체 중심");
    expect(prep.players.find((p) => p.id === id)!.training).toBe("라인전");
    expect(() => setPreparation(runRegular(prep), "균형", {})).toThrow();
  });
  it("sorts equal records deterministically and uses set difference first", () => {
    const g = createGame("t1");
    expect(standings(g)[0].teamId).toBe("bro");
    g.matches.push({
      id: "m0",
      phase: "regular",
      home: "t1",
      away: "geng",
      homeScore: 2,
      awayScore: 0,
      winner: "t1",
    });
    expect(standings(g)[0].teamId).toBe("t1");
  });
});
describe("round-by-round bracket and evaluations", () => {
  it("advances all six qualifiers through two quarterfinals, two semifinals and one final", () => {
    let g = runRegular(createGame("bro", 90));
    g = runPlayoff(g);
    expect(g.phase).toBe("semi");
    expect(g.matches.filter((m) => m.phase === "quarter")).toHaveLength(2);
    expect(
      g.matches
        .filter((m) => m.phase === "quarter")
        .flatMap((m) => [m.home, m.away]),
    ).not.toContain(g.seeds[0]);
    g = runPlayoff(g);
    expect(g.phase).toBe("final");
    const semis = g.matches.filter((m) => m.phase === "semi");
    expect(semis).toHaveLength(2);
    expect(semis[0].home).toBe(g.seeds[0]);
    expect(semis[1].home).toBe(g.seeds[1]);
    g = runPlayoff(g);
    expect(g.phase).toBe("complete");
    const final = g.matches.find((m) => m.phase === "final")!;
    expect([final.home, final.away].sort()).toEqual(
      semis.map((m) => m.winner).sort(),
    );
    expect(g.champion).toBe(final.winner);
    expect(Math.max(final.homeScore, final.awayScore)).toBe(3);
    expect(g.matches).toHaveLength(95);
    expect(() => runPlayoff(g)).toThrow();
    expect(
      g.ledger
        .filter((l) => l.category === "prize")
        .reduce((s, l) => s + l.amount, 0),
    ).toBe(5.5);
  });
  it("reports only participating players and staff for each stage, with bounded ratings and growth", () => {
    const g = completed();
    expect(g.reports.filter((r) => r.phase === "정규시즌")).toHaveLength(50);
    expect(g.staffReports.filter((r) => r.phase === "정규시즌")).toHaveLength(
      20,
    );
    expect(g.reports.filter((r) => r.phase === "플레이오프 결승")).toHaveLength(
      10,
    );
    for (const r of g.reports) {
      expect(r.rating).toBeGreaterThanOrEqual(3);
      expect(r.rating).toBeLessThanOrEqual(10);
      expect(r.growth).toBeGreaterThanOrEqual(0);
    }
    for (const p of g.players) expect(p.ovr).toBeLessThanOrEqual(p.potential);
  });
});
describe("rosters, contracts and equal AI finances", () => {
  it("registers exactly one starter per position for every club", () => {
    for (const id of ["t1", "bro", "hle"]) {
      const g = createGame(id);
      assertWorld(g);
      expect(
        roster(g, id)
          .map((p) => p.position)
          .sort(),
      ).toEqual([...POSITIONS].sort());
    }
  });
  it("signs a single-owner contract, reserves future salary, and promotes without deleting either contract", () => {
    const g = createGame("t1");
    const p = g.players.find((p) => !p.teamId)!;
    const old = roster(g, "t1").find((x) => x.position === p.position)!;
    const signed = signPlayer(g, "t1", p.id, p.salary, 2);
    expect(g.players.find((x) => x.id === p.id)!.teamId).toBeNull();
    expect(signed.teams[0].cash).toBeCloseTo(
      g.teams[0].cash - p.salary * 0.2,
      2,
    );
    expect(obligations(signed, "t1")).toBeCloseTo(
      obligations(g, "t1") + p.salary * 2,
      2,
    );
    expect(() => signPlayer(signed, "geng", p.id, p.salary, 1)).toThrow();
    const next = promote(signed, p.id);
    expect(roster(next, "t1")).toHaveLength(5);
    expect(roster(next, "t1", "academy").map((p) => p.id)).toContain(old.id);
    expect(next.players.find((x) => x.id === old.id)!.salary).toBe(old.salary);
    assertWorld(next);
  });
  it("rejects low, nonfinite and unaffordable salary offers for both human and AI teams", () => {
    const g = createGame("bro");
    const p = g.players.find((p) => !p.teamId)!;
    for (const team of ["t1", "geng", "bro"]) {
      expect(() => signPlayer(g, team, p.id, p.salary - 0.01, 1)).toThrow();
      expect(() => signPlayer(g, team, p.id, NaN, 1)).toThrow();
      expect(() => signPlayer(g, team, p.id, 1000, 3)).toThrow();
      expect(() => signPlayer(g, team, p.id, p.salary, 4)).toThrow();
    }
  });
  it("AI recruits with real deductions, preserves exclusive ownership and never overspends", () => {
    const before = createGame("bro"),
      g = runRegular(before);
    expect(g.events.some((e) => e.cause === "sign")).toBe(true);
    for (const t of g.teams) {
      expect(t.cash).toBeGreaterThanOrEqual(0);
      const sum = g.ledger
        .filter((l) => l.teamId === t.id)
        .reduce((s, l) => s + l.amount, 0);
      expect(t.cash).toBeCloseTo(t.initialCash + sum, 2);
      expect(
        g.ledger.find((l) => l.teamId === t.id && l.category === "salary")!
          .amount,
      ).toBeCloseTo(-payroll(g, t.id) / 2, 2);
    }
    assertWorld(g);
  });
  it("rejects unaffordable league start atomically", () => {
    const g = createGame("t1");
    g.teams[0].cash = 0;
    expect(() => runRegular(g)).toThrow();
    expect(g.matches).toHaveLength(0);
    expect(g.ledger).toHaveLength(0);
  });
  it("locks contracts and promotion once the season starts", () => {
    const g = runRegular(createGame("t1"));
    const p = g.players.find((p) => !p.teamId)!;
    expect(() => signPlayer(g, "t1", p.id, p.salary, 1)).toThrow();
    expect(() => promote(g, roster(g, "t1", "academy")[0].id)).toThrow();
    expect(() => hireStaff(g, "head", 92)).toThrow();
  });
  it("replaces staff before competition and evaluates only their current tenure", () => {
    const g = hireStaff(createGame("t1"), "head", 92),
      next = runRegular(g);
    expect(g.teams[0].staff.find((s) => s.role === "head")!.ability).toBe(92);
    expect(next.staffReports.some((r) => r.staffId === "t1-head")).toBe(false);
    expect(
      next.staffReports.find(
        (r) =>
          r.staffId === g.teams[0].staff.find((s) => s.role === "head")!.id,
      ),
    ).toBeDefined();
  });
});
describe("save/load and data provenance", () => {
  it("round-trips every stage including the RNG and resumes identically", () => {
    let g = createGame("t1", 14);
    expect(deserialize(serialize(g))).toEqual(g);
    g = runRegular(g);
    for (let i = 0; i < 3; i++) {
      const reloaded = deserialize(serialize(g));
      expect(reloaded).toEqual(g);
      expect(runPlayoff(reloaded)).toEqual(runPlayoff(g));
      g = runPlayoff(g);
    }
    expect(deserialize(serialize(g))).toEqual(g);
  });
  it("rejects malformed, unsupported, incomplete, and financially corrupt saves", () => {
    expect(() => deserialize("not json")).toThrow();
    for (const mutate of [
      (g: any) => {
        g.version = 999;
      },
      (g: any) => {
        g.players.pop();
      },
      (g: any) => {
        g.teams[0].cash = -1;
      },
      (g: any) => {
        g.matches.push({});
      },
      (g: any) => {
        g.phase = "complete";
      },
      (g: any) => {
        g.players[0].salary = -1;
      },
      (g: any) => {
        g.reports = [{}];
      },
    ]) {
      const g = createGame("t1");
      mutate(g);
      expect(() => deserialize(JSON.stringify(g))).toThrow();
    }
  });
  it("labels every player and contract as simulated and leaves unknown history null", () => {
    for (const p of createGame("t1").players) {
      expect(p.sourceStatus).toBe("simulated");
      expect(p.historicalContractEnd).toBeNull();
    }
  });
});
