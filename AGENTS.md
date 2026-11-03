# Instructions for Codex — LCK Manager

Read `PROJECT_SPEC.md` before coding. Treat it as product requirements and `data/선수능력치_초안.xlsx` as unverified preliminary game balance data.

Key non-negotiables:
- User picks one LCK organization only; starts in pre-2022 offseason.
- One click simulates the ENTIRE LCK regular season. Playoffs and international elimination stages advance per round. Swiss advances per Swiss round.
- All matches are fully automatic, probability-based, seeded and reproducible. No manual draft or mid-match controls.
- User sets five players' individual training and team-wide strategy BEFORE each tournament.
- Exactly five active first-team players on the user's club, one per position, NO sixth man; 2nd-team CL exists separately.
- After every stage, display meaningful player, head coach and coach performance reports. International non-qualifiers can scrim, review, analyze matches, rest.
- Year-specific tournament rules for 2022–2025, plus supported future mode. 2023 Worlds Swiss; 2025 LCK CUP, First Stand, Road to MSI.
- Budget, simulated salaries and LCK SFR salary-cap rules must remain distinct; never pass invented figures as official historical facts.
- Historical 2023–2025 rosters should NEVER overwrite live simulation states.
- Source code and comments in understandable English; user-facing interface in Korean.

For any ambiguous rule, first implement safe configurable behavior and document assumptions. Never silently invent a verified historical fact. Run automated tests for tournament brackets, league match count, save/load, contracts, and AI finance.
