import { useEffect, useRef, useState } from "react";
import {
  createGame,
  hireStaff,
  obligations,
  payroll,
  promote,
  roster,
  rules,
  runPlayoff,
  runRegular,
  setPreparation,
  signPlayer,
  standings,
  strength,
} from "./engine/game";
import {
  deserialize,
  loadGame,
  saveGame,
  serialize,
} from "./engine/persistence";
import { POSITIONS, STRATEGIES, TRAINING } from "./engine/types";
import type { Game, Player, Team } from "./engine/types";
const money = (n: number) => `${n.toFixed(2)}억`;
const phaseName = {
  offseason: "스토브리그",
  quarter: "플레이오프 1라운드",
  semi: "플레이오프 4강",
  final: "플레이오프 결승",
  complete: "스프링 결산",
};
const tabs = [
  ["home", "구단 홈", "◈"],
  ["squad", "선수단 · 훈련", "♙"],
  ["market", "이적시장", "⇄"],
  ["staff", "감독 · 코치", "♜"],
  ["finance", "재정", "▥"],
  ["results", "대회 · 평가", "≡"],
] as const;
type Tab = (typeof tabs)[number][0];
function Badge({
  team,
  large = false,
}: {
  team: Pick<Team, "short" | "color">;
  large?: boolean;
}) {
  return (
    <span
      className={`badge ${large ? "large" : ""}`}
      style={{ "--club": team.color } as React.CSSProperties}
    >
      {team.short}
    </span>
  );
}
function App() {
  const [game, setGame] = useState<Game | null>(null),
    [loaded, setLoaded] = useState(false),
    [tab, setTab] = useState<Tab>("home"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [choosing, setChoosing] = useState(false),
    [seed, setSeed] = useState("2022");
  const [position, setPosition] = useState("ALL"),
    [search, setSearch] = useState(""),
    [reportPhase, setReportPhase] = useState("정규시즌");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    loadGame()
      .then((g) => {
        setGame(g);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, []);
  const apply = async (next: Game) => {
    setGame(next);
    setError("");
    try {
      await saveGame(next);
      setNotice("자동 저장 완료");
    } catch {
      setError(
        "브라우저 저장소에 저장하지 못했습니다. 저장 파일을 내려받아 보관해 주세요.",
      );
    }
  };
  const action = (fn: () => Game) => {
    try {
      void apply(fn());
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const advance = () => {
    setConfirm(false);
    setBusy(true);
    window.setTimeout(() => {
      try {
        if (!game) return;
        const next =
          game.phase === "offseason" ? runRegular(game) : runPlayoff(game);
        void apply(next);
        setTab("results");
        setReportPhase(
          game.phase === "offseason" ? "정규시즌" : phaseName[game.phase],
        );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 40);
  };
  const exportGame = () => {
    if (!game) return;
    const url = URL.createObjectURL(
      new Blob([serialize(game)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `LCK-${game.teamId}-${game.phase}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (f?: File) => {
    if (!f) return;
    try {
      if (f.size > 5_000_000)
        throw Error("저장 파일은 5MB 이하만 불러올 수 있습니다.");
      const next = deserialize(await f.text());
      await apply(next);
      setChoosing(false);
      setTab("home");
    } catch (e) {
      setError((e as Error).message);
    }
    if (file.current) file.current.value = "";
  };
  const importInput = (
    <input
      ref={file}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={(e) => void upload(e.target.files?.[0])}
    />
  );
  if (!loaded)
    return (
      <div className="loading">
        LCK MANAGER <span>저장된 구단을 불러오는 중…</span>
      </div>
    );
  if (!game || choosing)
    return (
      <div className="selection">
        {importInput}
        <header className="selection-top">
          <a className="wordmark" href="#">
            LCK<span>MANAGER</span>
            <small>2022 / SPRING</small>
          </a>
          <div>
            <span className="version">PLAYABLE PROTOTYPE · 0.1</span>
            {game && (
              <button onClick={() => setChoosing(false)}>
                현재 구단으로 돌아가기
              </button>
            )}
            <button onClick={() => file.current?.click()}>
              저장 불러오기 ↗
            </button>
          </div>
        </header>
        <main>
          <div className="selection-heading">
            <div>
              <div className="eyebrow">YOUR CLUB. YOUR LEGACY.</div>
              <h1>
                승리의 역사를,
                <br />
                <em>당신의 손으로.</em>
              </h1>
              <p>
                열 개의 구단, 하나의 선택.
                <br />
                2021년 스토브리그에서 당신만의 2022 시즌을 시작하세요.
              </p>
            </div>
            <aside className="intro-card">
              <span className="tiny">SEASON 01</span>
              <strong>
                새로운 시대의
                <br />
                구단주를 찾습니다.
              </strong>
              <p>
                선수단을 만들고. 전략을 세우고.
                <br />
                90경기 끝에, 당신의 선택을 증명하세요.
              </p>
              <div className="intro-meta">
                <span>10 CLUBS</span>
                <span>90 MATCHES</span>
                <span>1 CHAMPION</span>
              </div>
            </aside>
          </div>
          <div className="section-header">
            <h2>함께 역사를 쓸 구단</h2>
            <label className="seed">
              시뮬레이션 시드{" "}
              <input
                aria-label="시뮬레이션 시드"
                type="number"
                min="0"
                max="4294967295"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
          </div>
          <div className="club-grid">
            {rules.organizations.map((t, i) => (
              <button
                className="club-card"
                key={t.id}
                onClick={() => {
                  const n = Number(seed);
                  if (
                    !seed ||
                    !Number.isInteger(n) ||
                    n < 0 ||
                    n > 4294967295
                  ) {
                    setError(
                      "시드는 0~4294967295 사이의 정수로 입력해 주세요.",
                    );
                    return;
                  }
                  action(() => createGame(t.id, n));
                  setChoosing(false);
                  setTab("home");
                }}
              >
                <div className="club-top">
                  <Badge team={t} />
                  <span className="club-number">
                    {String(i + 1).padStart(2, "0")} ↗
                  </span>
                </div>
                <h3>{t.name}</h3>
                <span className="club-style">{t.style}</span>
                <div className="club-bottom">
                  <span>
                    시작 자금 <b>{t.cash}억</b>
                  </span>
                  <span>
                    {t.cash >= 75
                      ? "도전 난도 ●○○"
                      : t.cash >= 50
                        ? "도전 난도 ●●○"
                        : "도전 난도 ●●●"}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="data-note">
            <span>ⓘ 시범 데이터 안내</span>
            <p>
              이번 버전은 2022 스프링만 지원합니다. 초기 로스터는 가상 선수이며,
              실제 선수의 이름·능력치는 첨부된 미검증 초안을 사용한 가상 FA
              시장에만 등장합니다. 실제 계약·연봉·구단 재정을 재현한 게임이
              아닙니다. 팀명은 2022 시즌 표기를 사용합니다.
            </p>
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
        </main>
        <footer>
          나의 구단, 새로운 역사. <span>LCK MANAGER · 비공식 팬 프로젝트</span>
        </footer>
      </div>
    );
  const team = game.teams.find((t) => t.id === game.teamId)!,
    first = roster(game, team.id),
    academy = roster(game, team.id, "academy"),
    table = standings(game),
    rank = table.findIndex((r) => r.teamId === team.id) + 1,
    record = table.find((r) => r.teamId === team.id)!,
    locked = game.phase !== "offseason";
  const teamName = (id: string) =>
    game.teams.find((t) => t.id === id)?.short ?? id;
  const canAdvance = game.phase !== "complete";
  const playerCard = (p: Player, isAcademy = false) => (
    <div className="player-card" key={p.id}>
      <div className="player-top">
        <span className="position">{p.position}</span>
        <b className="ovr">
          {p.ovr.toFixed(0)}
          <small>OVR</small>
        </b>
      </div>
      <div className="player-avatar">
        {p.position === "TOP"
          ? "♜"
          : p.position === "JGL"
            ? "♞"
            : p.position === "MID"
              ? "♝"
              : p.position === "BOT"
                ? "♛"
                : "♚"}
      </div>
      <h3>{p.name}</h3>
      <div className="player-detail">
        <span>
          잠재력 <b>{p.potential}</b>
        </span>
        <span>
          {money(p.salary)} / {p.years}년
        </span>
      </div>
      <div className="meter">
        <i style={{ width: `${p.ovr}%` }} />
      </div>
      {isAcademy ? (
        <button
          className="wide"
          disabled={locked || busy}
          onClick={() => action(() => promote(game, p.id))}
        >
          1군 콜업 · 동일 포지션 교체
        </button>
      ) : (
        <label className="training-label">
          훈련 방향
          <select
            aria-label={`${p.name} 훈련 방향`}
            value={p.training}
            disabled={locked || busy}
            onChange={(e) =>
              action(() =>
                setPreparation(game, team.strategy, { [p.id]: e.target.value }),
              )
            }
          >
            {TRAINING.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
  const renderTable = () => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>순위</th>
            <th>구단</th>
            <th>승</th>
            <th>패</th>
            <th>세트</th>
            <th>득실</th>
          </tr>
        </thead>
        <tbody>
          {table.map((r, i) => (
            <tr
              key={r.teamId}
              className={`${r.teamId === team.id ? "my-row" : ""} ${i === 5 ? "cutoff" : ""}`}
            >
              <td>
                <span className={i < 6 ? "rank qualified" : "rank"}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </td>
              <td>
                <span className="table-team">
                  <span
                    style={{
                      color: game.teams.find((t) => t.id === r.teamId)!.color,
                    }}
                  >
                    ●
                  </span>
                  {teamName(r.teamId)}
                  {r.teamId === team.id && <small>MY</small>}
                </span>
              </td>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>
                {r.setsFor} : {r.setsAgainst}
              </td>
              <td className={r.differential > 0 ? "positive" : ""}>
                {r.differential > 0 ? "+" : ""}
                {r.differential}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="app">
      {importInput}
      <aside className="sidebar">
        <a href="#" className="wordmark">
          LCK<span>MANAGER</span>
        </a>
        <div className="sidebar-club">
          <Badge team={team} />
          <div>
            <strong>{team.name}</strong>
            <small>2022 스프링 · 구단주</small>
          </div>
        </div>
        <div className="nav-label">CLUB MANAGEMENT</div>
        <nav>
          {tabs.map(([key, label, icon]) => (
            <button
              className={tab === key ? "active" : ""}
              key={key}
              onClick={() => setTab(key)}
            >
              <span>{icon}</span>
              {label}
              {tab === key && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="online">
            <i /> 시드 {game.seed} · 로컬 플레이
          </div>
          <button onClick={exportGame}>↓ 저장 파일 내보내기</button>
          <button onClick={() => file.current?.click()}>
            ↗ 저장 파일 불러오기
          </button>
          <button onClick={() => setChoosing(true)}>＋ 새 게임</button>
          <small>
            새 구단 선택 시 자동 저장을 교체합니다.
            <br />
            현재 게임은 먼저 내보내 주세요.
          </small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            구단 운영실{" "}
            <span className="muted">
              / {tabs.find((t) => t[0] === tab)?.[1]}
            </span>
          </span>
          <div>
            <span className="save-status">{notice || "저장 불러옴"}</span>
            <span className="date">
              {game.date.replaceAll("-", ".")} <b>{phaseName[game.phase]}</b>
            </span>
          </div>
        </header>
        <main className="dashboard">
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="알림 닫기">
                ×
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                2022 LCK SPRING / {tab.toUpperCase()}
              </div>
              <h1>
                {tab === "home"
                  ? "구단의 내일을 설계하세요."
                  : tabs.find((t) => t[0] === tab)?.[1]}
              </h1>
              <p>
                {tab === "home"
                  ? "좋은 선택이 쌓여, 위대한 시즌이 됩니다."
                  : "당신의 결정이 구단의 다음 장을 만듭니다."}
              </p>
            </div>
            <span className="season-label">
              <i /> {locked ? "시즌 진행 중" : "OFF-SEASON"}
            </span>
          </div>
          {tab === "home" && (
            <>
              <section className="season-hero">
                <div>
                  <div className="eyebrow">
                    {game.champion ? "THE CHAMPIONS" : "THE NEXT CHAPTER"}
                  </div>
                  <h2>
                    {game.champion
                      ? `${teamName(game.champion)}, 정상에 서다.`
                      : game.phase === "offseason"
                        ? "우승은, 준비에서 시작됩니다."
                        : `${phaseName[game.phase]}의 시간입니다.`}
                  </h2>
                  <p>
                    {game.phase === "offseason"
                      ? "계약과 훈련을 마무리하고, 10개 구단의 정규시즌 90경기를 한 번에 진행하세요."
                      : game.phase === "complete"
                        ? "2022 스프링이 막을 내렸습니다. 최종 대진과 선수단의 성장을 확인하세요."
                        : "모든 참가 구단의 이번 라운드를 자동으로 진행합니다. 탈락한 구단도 결과를 확인할 수 있습니다."}
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      canAdvance ? setConfirm(true) : setTab("results")
                    }
                  >
                    {busy
                      ? "시뮬레이션 중…"
                      : game.phase === "offseason"
                        ? "정규시즌 전체 진행"
                        : game.phase === "complete"
                          ? "시즌 결산 보기"
                          : `${phaseName[game.phase]} 진행`}{" "}
                    <span>↗</span>
                  </button>
                </div>
                <div className="hero-emblem">
                  <Badge team={team} large />
                  <span>BUILD YOUR LEGACY</span>
                </div>
              </section>
              <div className="stats">
                <article>
                  <span>구단 보유 현금</span>
                  <strong>
                    {money(team.cash)}
                    <small> 원</small>
                  </strong>
                  <small>모든 재정은 가상 밸런스 수치</small>
                </article>
                <article>
                  <span>선수단 종합 전력</span>
                  <strong>
                    {strength(game, team.id).toFixed(1)}
                    <small> / 100</small>
                  </strong>
                  <small>선수 · 지도자 · 전략 종합</small>
                </article>
                <article>
                  <span>정규시즌 순위</span>
                  <strong>
                    {locked ? `${rank}위` : "—"}
                    <small> / 10팀</small>
                  </strong>
                  <small>
                    {locked
                      ? `${record.wins}승 ${record.losses}패 · 세트 득실 ${record.differential}`
                      : "정규시즌 개막 전"}
                  </small>
                </article>
                <article>
                  <span>1군 등록</span>
                  <strong>
                    5<small> / 5명</small>
                  </strong>
                  <small>TOP · JGL · MID · BOT · SUP</small>
                </article>
              </div>
              <div className="section-header">
                <h2>
                  우리 팀의 다섯 기둥 <small>FIRST TEAM</small>
                </h2>
                <button className="text-button" onClick={() => setTab("squad")}>
                  선수단 관리 ↗
                </button>
              </div>
              <div className="roster-grid">
                {first.map((p) => playerCard(p))}
              </div>
              <div className="home-bottom">
                <section className="panel">
                  <div className="section-header">
                    <h2>리그 순위</h2>
                    <span className="tiny">
                      {locked ? "REGULAR SEASON" : "시즌 시작 전"}
                    </span>
                  </div>
                  {renderTable()}
                  <p className="table-note">
                    상위 6팀 플레이오프 진출 · 승수 → 세트 득실 → 동률 그룹 상대
                    전적 → 구단 ID
                  </p>
                </section>
                <section className="panel news">
                  <div className="section-header">
                    <h2>구단 소식</h2>
                    <span className="tiny">CLUB JOURNAL</span>
                  </div>
                  {game.events
                    .slice(-5)
                    .reverse()
                    .map((e) => (
                      <article key={e.id}>
                        <time>
                          {e.date.replaceAll("-", ".")} <span>●</span>
                        </time>
                        <p>{e.message}</p>
                      </article>
                    ))}
                  <div className="mini-note">
                    시범 버전 · 역사적 로스터와 계약 미재현
                    <br />
                    2022 스프링 이후 일정은 추후 지원됩니다.
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "squad" && (
            <>
              <section className="panel prep">
                <div>
                  <h2>대회 전 준비</h2>
                  <p>
                    {locked
                      ? "대회가 시작되어 훈련·전략·등록 변경이 잠겼습니다."
                      : "1군은 각 포지션 한 명씩. 콜업하면 기존 주전은 계약을 유지한 채 2군으로 이동합니다."}
                  </p>
                </div>
                <label>
                  팀 전략
                  <select
                    aria-label="팀 전략"
                    value={team.strategy}
                    disabled={locked || busy}
                    onChange={(e) =>
                      action(() => setPreparation(game, e.target.value, {}))
                    }
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </section>
              <div className="section-header">
                <h2>
                  1군 선수단 <small>5 / 5</small>
                </h2>
                <span className="tiny">연봉·계약은 모두 가상</span>
              </div>
              <div className="roster-grid">
                {first.map((p) => playerCard(p))}
              </div>
              <div className="section-header">
                <h2>
                  2군 · LCK CL <small>{academy.length}명</small>
                </h2>
              </div>
              <div className="roster-grid">
                {academy.map((p) => playerCard(p, true))}
              </div>
              <p className="table-note">
                현재 2군 등록·콜업만 지원합니다. CL 별도 리그와 경기·육성은 추후
                구현 예정입니다.
              </p>
            </>
          )}
          {tab === "market" && (
            <>
              <div className="info-banner">
                가상 FA 시장 · 실제 계약 상태가 아닙니다. 첨부 엑셀의 미검증
                2022 능력치 초안을 사용합니다. 영입 선수는 2군 합류 후 콜업할 수
                있습니다.
              </div>
              <div className="market-filters">
                <div className="chips">
                  {["ALL", ...POSITIONS].map((p) => (
                    <button
                      className={position === p ? "selected" : ""}
                      key={p}
                      onClick={() => setPosition(p)}
                    >
                      {p === "ALL" ? "전체 포지션" : p}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="선수 검색"
                  placeholder="선수 이름 검색…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {locked && (
                <p className="info-banner">대회 중에는 계약할 수 없습니다.</p>
              )}
              <div className="market-grid">
                {game.players
                  .filter(
                    (p) =>
                      p.teamId === null &&
                      (position === "ALL" || p.position === position) &&
                      p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .sort((a, b) => b.ovr - a.ovr)
                  .map((p) => (
                    <MarketCard
                      key={p.id}
                      player={p}
                      disabled={locked || busy}
                      onSign={(salary, years) =>
                        action(() =>
                          signPlayer(game, team.id, p.id, salary, years),
                        )
                      }
                    />
                  ))}
              </div>
              {!game.players.some(
                (p) =>
                  p.teamId === null &&
                  (position === "ALL" || p.position === position) &&
                  p.name.toLowerCase().includes(search.toLowerCase()),
              ) && <div className="empty">조건에 맞는 FA 선수가 없습니다.</div>}
            </>
          )}
          {tab === "staff" && (
            <>
              <div className="info-banner">
                가상 지도자 후보 · 스토브리그 중 교체할 수 있습니다. 대회가
                시작되면 지도자와 훈련 방향이 잠깁니다.
              </div>
              <div className="staff-grid">
                {team.staff.map((s) => (
                  <section className="panel" key={s.id}>
                    <span className="eyebrow">
                      {s.role === "head" ? "HEAD COACH" : "COACH"}
                    </span>
                    <h2>{s.name}</h2>
                    <div className="staff-score">
                      {s.ability}
                      <small>지도력</small>
                    </div>
                    <p>연봉 {money(s.salary)} 원 · 대회 전체 재임</p>
                    <p className="muted">
                      {s.role === "head"
                        ? "전술·밴픽 지도력은 팀 전력의 12%를 담당합니다."
                        : "선수 지도력은 팀 전력의 8%를 담당합니다."}
                    </p>
                    <h3>교체 후보</h3>
                    {[76, 84, 92].map((a) => (
                      <div className="staff-candidate" key={a}>
                        <span>
                          지도력 {a}
                          <small>연봉 {money((a - 60) / 8)} 원</small>
                        </span>
                        <button
                          disabled={locked || busy}
                          onClick={() =>
                            action(() => hireStaff(game, s.role, a))
                          }
                        >
                          계약
                        </button>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
          {tab === "finance" && (
            <>
              <div className="stats">
                <article>
                  <span>현재 현금</span>
                  <strong>{money(team.cash)}</strong>
                  <small>시작 현금 {money(team.initialCash)}</small>
                </article>
                <article>
                  <span>선수·지도자 연간 급여</span>
                  <strong>{money(payroll(game, team.id))}</strong>
                  <small>1군·2군·지도자 전체</small>
                </article>
                <article>
                  <span>전체 계약 보장액</span>
                  <strong>{money(obligations(game, team.id))}</strong>
                  <small>연봉 × 기간 + 지도자 연봉</small>
                </article>
                <article>
                  <span>2022 SFR</span>
                  <strong className="small-strong">적용 없음</strong>
                  <small>급여와 별개인 제도</small>
                </article>
              </div>
              <section className="panel">
                <h2>거래 원장</h2>
                <p className="muted">
                  연봉 50%를 스프링 시작 시 일괄 지출합니다. 계약금은 연봉의
                  20%, 상금은 가상 금액입니다.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>거래 내용</th>
                        <th>수입·지출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {game.ledger
                        .filter((l) => l.teamId === team.id)
                        .map((l) => (
                          <tr key={l.id}>
                            <td>{l.description}</td>
                            <td className={l.amount >= 0 ? "positive" : ""}>
                              {l.amount > 0 ? "+" : ""}
                              {money(l.amount)} 원
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!game.ledger.some((l) => l.teamId === team.id) && (
                  <p className="empty">아직 거래가 없습니다.</p>
                )}
                <p className="table-note">
                  현금 = 시작 현금 + 거래 합계. 이 MVP는 스프링만 다루며 모기업
                  지원·스폰서·세금·운영비는 아직 정산하지 않습니다. 보장액은
                  이미 지출한 스프링 급여를 차감하지 않은 보수적인 총
                  약정액입니다.
                </p>
              </section>
            </>
          )}
          {tab === "results" && (
            <>
              {!locked ? (
                <div className="empty panel">
                  <h2>아직 시즌이 시작되지 않았습니다.</h2>
                  <p>계약과 훈련을 준비한 후 정규시즌을 진행해 주세요.</p>
                  <button className="primary" onClick={() => setConfirm(true)}>
                    정규시즌 전체 진행 ↗
                  </button>
                </div>
              ) : (
                <>
                  {game.champion && (
                    <section className="champion">
                      <span>2022 SPRING CHAMPION</span>
                      <h2>
                        {game.teams.find((t) => t.id === game.champion)!.name}
                      </h2>
                      <p>당신의 선택으로 쓰인, 새로운 역사.</p>
                    </section>
                  )}
                  <div className="section-header">
                    <h2>정규시즌 최종 순위</h2>
                    <span>90경기 · 구단별 18경기</span>
                  </div>
                  <section className="panel">
                    {renderTable()}
                    <p className="table-note">
                      동률 시 승수 → 세트 득실 → 동률 그룹 상대 전적 → 구단 ID.
                      공식 추가 순위 결정전을 대체하는 MVP 규칙입니다.
                    </p>
                  </section>
                  <div className="section-header">
                    <h2>플레이오프 대진</h2>
                    {canAdvance && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => setConfirm(true)}
                      >
                        {phaseName[game.phase]} 진행 ↗
                      </button>
                    )}
                  </div>
                  <div className="bracket">
                    {(["quarter", "semi", "final"] as const).map((p, i) => (
                      <section className="panel" key={p}>
                        <span className="eyebrow">ROUND 0{i + 1}</span>
                        <h3>{phaseName[p]}</h3>
                        {game.matches
                          .filter((m) => m.phase === p)
                          .map((m) => (
                            <div className="match-box" key={m.id}>
                              <div
                                className={m.winner === m.home ? "winner" : ""}
                              >
                                <b>{teamName(m.home)}</b>
                                <strong>{m.homeScore}</strong>
                              </div>
                              <div
                                className={m.winner === m.away ? "winner" : ""}
                              >
                                <b>{teamName(m.away)}</b>
                                <strong>{m.awayScore}</strong>
                              </div>
                            </div>
                          ))}
                        {!game.matches.some((m) => m.phase === p) && (
                          <p className="muted">
                            {p === "quarter"
                              ? `${teamName(game.seeds[2])} vs ${teamName(game.seeds[5])} / ${teamName(game.seeds[3])} vs ${teamName(game.seeds[4])}`
                              : p === "semi"
                                ? `1·2위 직행 · 1위가 낮은 시드 상대 선택`
                                : "4강 승자 진출"}
                          </p>
                        )}
                      </section>
                    ))}
                  </div>
                  <div className="section-header">
                    <h2>선수 · 지도자 평가</h2>
                    <select
                      aria-label="평가 단계"
                      value={reportPhase}
                      onChange={(e) => setReportPhase(e.target.value)}
                    >
                      {[...new Set(game.reports.map((r) => r.phase))].map(
                        (p) => (
                          <option key={p}>{p}</option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="report-grid">
                    {game.reports
                      .filter(
                        (r) =>
                          r.phase === reportPhase &&
                          game.players.find((p) => p.id === r.playerId)
                            ?.teamId === team.id,
                      )
                      .map((r) => (
                        <article
                          className="panel report"
                          key={`${r.phase}-${r.playerId}`}
                        >
                          <div>
                            <span className="position">
                              {
                                game.players.find((p) => p.id === r.playerId)
                                  ?.position
                              }
                            </span>
                            <strong>
                              {r.rating.toFixed(1)}
                              <small> / 10</small>
                            </strong>
                          </div>
                          <h3>{r.name}</h3>
                          <p className="stars">
                            역량 {r.stars} ★{" "}
                            <span>잠재력 {r.potentialStars} ★</span>
                          </p>
                          <p>{r.comment}</p>
                          <dl>
                            <div>
                              <dt>대회 합산 K / D / A</dt>
                              <dd>{r.kda}</dd>
                            </div>
                            <div>
                              <dt>OVR 성장</dt>
                              <dd className="positive">
                                +{r.growth.toFixed(2)}
                              </dd>
                            </div>
                            <div>
                              <dt>가상 시장 가치</dt>
                              <dd>{money(r.value)}</dd>
                            </div>
                            <div>
                              <dt>연봉 1억당 평점</dt>
                              <dd>{r.efficiency.toFixed(2)}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                  </div>
                  {!game.reports.some(
                    (r) =>
                      r.phase === reportPhase &&
                      game.players.find((p) => p.id === r.playerId)?.teamId ===
                        team.id,
                  ) && (
                    <p className="empty">
                      우리 구단은 이 라운드에 출전하지 않았습니다.
                    </p>
                  )}
                  <div className="staff-grid">
                    {game.staffReports
                      .filter(
                        (r) =>
                          r.phase === reportPhase &&
                          team.staff.some((s) => s.id === r.staffId),
                      )
                      .map((r) => (
                        <section
                          className="panel"
                          key={`${r.phase}-${r.staffId}`}
                        >
                          <span className="tiny">
                            {r.role === "head" ? "감독" : "코치"} 평가
                          </span>
                          <h3>
                            {r.name}{" "}
                            <b className="positive">
                              {r.rating.toFixed(1)} / 10
                            </b>
                          </h3>
                          <p>{r.comment}</p>
                        </section>
                      ))}
                  </div>
                  <details className="panel history">
                    <summary>정규시즌 전체 경기 기록 · 90경기</summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>경기</th>
                            <th>홈</th>
                            <th>스코어</th>
                            <th>원정</th>
                          </tr>
                        </thead>
                        <tbody>
                          {game.matches
                            .filter((m) => m.phase === "regular")
                            .map((m, i) => (
                              <tr
                                key={m.id}
                                className={
                                  [m.home, m.away].includes(team.id)
                                    ? "my-row"
                                    : ""
                                }
                              >
                                <td>{i + 1}</td>
                                <td>{teamName(m.home)}</td>
                                <td>
                                  {m.homeScore} : {m.awayScore}
                                </td>
                                <td>{teamName(m.away)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <p className="table-note">
                    KDA·평가·성장은 경기 승패와 선수 역할을 바탕으로 생성한 게임
                    수치입니다. 2023~2025·국제대회·다음 시즌은 이 첫 버전에
                    포함되지 않습니다.
                  </p>
                </>
              )}
            </>
          )}
          <div className="mobile-save">
            <button onClick={exportGame}>저장 내보내기</button>
            <button onClick={() => file.current?.click()}>저장 불러오기</button>
            <button onClick={() => setChoosing(true)}>새 게임</button>
          </div>
          <footer>
            가상 계약 · 미검증 선수 초안{" "}
            <span>LCK MANAGER / 2022 SPRING MVP</span>
          </footer>
        </main>
      </div>
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <span className="eyebrow">READY TO COMPETE?</span>
            <h2 id="confirm-title">
              {game.phase === "offseason"
                ? "정규시즌 전체를 진행할까요?"
                : `${phaseName[game.phase]}를 진행할까요?`}
            </h2>
            <p>
              {game.phase === "offseason"
                ? "모든 구단의 BO3 90경기를 자동으로 진행하고 플레이오프 직전에 멈춥니다. AI도 영입하며, 모든 구단에 스프링 급여가 지출됩니다. 대회 종료까지 선수단·훈련·전략·계약이 잠깁니다."
                : "진출한 모든 팀의 이번 라운드 BO5 경기를 진행합니다. 결과와 성장은 자동 저장됩니다."}
            </p>
            <div className="confirm-summary">
              <span>
                1군 등록 <b>5 / 5</b>
              </span>
              <span>
                팀 전략 <b>{team.strategy}</b>
              </span>
              <span>
                스프링 급여 <b>{money(payroll(game, team.id) / 2)} 원</b>
              </span>
            </div>
            <div className="modal-actions">
              <button onClick={() => setConfirm(false)}>돌아가기</button>
              <button autoFocus className="primary" onClick={advance}>
                전체 자동 진행 →
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function MarketCard({
  player: p,
  disabled,
  onSign,
}: {
  player: Player;
  disabled: boolean;
  onSign: (salary: number, years: number) => void;
}) {
  const [salary, setSalary] = useState(String(p.salary)),
    [years, setYears] = useState("1");
  return (
    <article className="panel market-card">
      <div className="player-top">
        <span className="position">{p.position} · 가상 FA</span>
        <b className="ovr">
          {p.ovr}
          <small>OVR</small>
        </b>
      </div>
      <h3>{p.name}</h3>
      <p className="muted">
        잠재력 {p.potential} · 희망 연봉 {money(p.salary)} 원
      </p>
      <div className="contract-fields">
        <label>
          제안 연봉 (억 원)
          <input
            aria-label={`${p.name} 제안 연봉`}
            type="number"
            step="0.01"
            min={p.salary}
            value={salary}
            disabled={disabled}
            onChange={(e) => setSalary(e.target.value)}
          />
        </label>
        <label>
          계약 기간
          <select
            aria-label={`${p.name} 계약 기간`}
            value={years}
            disabled={disabled}
            onChange={(e) => setYears(e.target.value)}
          >
            {[1, 2, 3].map((n) => (
              <option value={n} key={n}>
                {n}년
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="tiny">계약금 연봉의 20% · 전 기간 급여 보장 필요</p>
      <button
        className="wide"
        disabled={disabled}
        onClick={() => onSign(Number(salary), Number(years))}
      >
        계약 제안 →
      </button>
    </article>
  );
}
export default App;
