export const POSITIONS = ["TOP", "JGL", "MID", "BOT", "SUP"] as const;
export type Position = (typeof POSITIONS)[number];
export const TRAINING = [
  "라인전",
  "피지컬",
  "한타",
  "운영",
  "챔피언 폭",
  "메타 연구",
  "팀워크",
  "약점 보완",
  "컨디션 관리",
] as const;
export const STRATEGIES = [
  "상체 중심",
  "미드 중심",
  "바텀 중심",
  "초반 공격",
  "후반 성장",
  "운영",
  "균형",
  "메타 중심",
] as const;
export type Phase = "offseason" | "quarter" | "semi" | "final" | "complete";
export interface Player {
  id: string;
  name: string;
  position: Position;
  ovr: number;
  potential: number;
  salary: number;
  years: number;
  teamId: string | null;
  squad: "first" | "academy" | "market";
  training: string;
  sourceStatus: "simulated";
  historicalContractEnd: null;
}
export interface Staff {
  id: string;
  name: string;
  role: "head" | "coach";
  ability: number;
  salary: number;
}
export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  cash: number;
  initialCash: number;
  reputation: number;
  style: string;
  teamwork: number;
  strategy: string;
  staff: Staff[];
}
export interface Match {
  id: string;
  phase: Exclude<Phase, "offseason" | "complete"> | "regular";
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  winner: string;
}
export interface Ledger {
  id: string;
  teamId: string;
  amount: number;
  category: "salary" | "signing" | "prize";
  description: string;
}
export interface Event {
  id: string;
  date: string;
  cause: string;
  message: string;
}
export interface Report {
  phase: string;
  playerId: string;
  name: string;
  rating: number;
  stars: number;
  potentialStars: number;
  kda: string;
  growth: number;
  comment: string;
  value: number;
  efficiency: number;
}
export interface StaffReport {
  phase: string;
  staffId: string;
  name: string;
  role: string;
  rating: number;
  comment: string;
}
export interface Game {
  version: 1;
  rulesId: string;
  seed: number;
  rng: number;
  teamId: string;
  date: string;
  phase: Phase;
  teams: Team[];
  players: Player[];
  matches: Match[];
  ledger: Ledger[];
  events: Event[];
  reports: Report[];
  staffReports: StaffReport[];
  seeds: string[];
  champion: string | null;
  aiDone: boolean;
}
export interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  setsFor: number;
  setsAgainst: number;
  differential: number;
}
