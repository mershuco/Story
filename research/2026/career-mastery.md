# 2026 로스터 챔피언 숙련도 자료

게임에 등록된 선수 201명의 공개 공식전을 2013년부터 조회했다. 선수 한 명의 한 세트 출전을 한 건으로 세어 **108,153건**을 숙련도에 반영했다. 2013~2024년 63,775건, 2025년 21,267건, 2026년 23,111건이다. 자료에 연결된 가장 이른 경기는 2013년 3월 23일 OGN 스프링 예선이고, 가장 늦은 경기는 2026년 11월 21일 HLL 슈퍼컵이다. 2026 월즈는 결승까지 98세트를 대조했다. [인벤 경기 기록실](https://lol.inven.co.kr/dataninfo/match/playerList.php?playerName=Faker&startDate=2013-01-01&endDate=2013-12-31) · [2026 월즈 경기표](https://gol.gg/tournament/tournament-matchlist/Worlds%202026%20Main%20Event/)

## 경기와 선수 확인

- 2013년 페이커 79세트를 연결했다. LeagueRecords 경기표에 빠진 OGN 스프링 예선, AMD 챔피언십, WCG 한국 선발전 10세트는 인벤 기록실에서 챔피언, 승패, KDA를 확인했다. 2014년 올스타전과 NLB 스프링·마스터즈 20세트도 같은 방식으로 보완했다. OGN 2014 윈터 조별 리그는 실제 경기 연도인 2013년에 집계했다. [인벤 원장 대조 자료](early-scoreboards.json) · [OGN 윈터 경기 일정](https://lol.fandom.com/wiki/Champions/2014_Season/Winter_Season/VODs)
- Oracle’s Elixir 선수 ID를 우선 썼다. ID가 없는 원장은 실제 닉네임과 소속 기간이 일치하거나, 출처 간 챔피언·승패·KDA를 대조해 같은 선수임을 확인한 경우에 연결했다. 스폰서 변경 전후 구단명도 동일 팀으로 연결했다. 두 자료에 있는 같은 세트는 한 번만 세었다. [Oracle’s Elixir](https://oracleselixir.com/tools/downloads) · [ChainCC, CC BY 4.0](https://chaincc.lol/free/data/) · [Leaguepedia 소속 이력 스냅샷, CC BY-SA 3.0](https://github.com/liveldy/Nous-Plugin-LoL-Almanac)
- ON의 Suning-S 시절, 룰러의 Stardust 시절, Sero의 KT 아카데미 시절처럼 이적 이력에서 빠진 구간을 별도로 확인했다. 2025 LEC와 2025~2026 데마시아컵 원장에 빠진 10세트에서 로스터 선수 출전 44건을 복원했다. [ON의 2019 경기 통계](https://lol.fandom.com/wiki/Suning-S/Statistics/2019) · [Stardust](https://liquipedia.net/leagueoflegends/Stardust) · [Sero](https://liquipedia.net/leagueoflegends/Sero) · [LEC 경기표](https://pem.lol/lec/2025/summer/matches/fnatic-vs-karmine-corp-2025-09-26) · [데마시아컵 경기표](https://riftwise.gg/tournament/demacia-cup-2025)
- 공개 경기표에 선수나 챔피언 정보가 없는 세트, 출처끼리 선수 식별이나 경기 내용이 어긋나는 세트는 반영을 보류했다. 예를 들어 Leaguepedia의 2019년 ON 합계는 71세트이고, 개별 경기에서 ON의 출전을 확인한 70세트만 반영했다. 미연결 원장 행에는 동명이인 기록도 들어 있다. 일부 오래된 경기에는 대회 연도만 남아 있다. [연도별 출전 집계와 확인 범위](career-match-history.json)

## 점수 산정

관측된 출전이 없으면 48점이다. 2025년 출전에 가중치 1을 주고 이전 연도는 한 해마다 0.8배씩 줄이되 0.15에서 멈춘다. 가중 출전량과 전체 커리어 출전 횟수가 모두 점수에 들어간다. 자주 선택한 주력 챔피언에는 최대 약 4점을 더한다. 승패는 각 선수의 전체 공식전 승률을 기준으로 보정하고, 표본이 적을수록 보정 폭을 줄인다. 승패로 인한 변화는 ±4점으로 제한했다.

기록으로 확인된 쿼드라킬은 1점, 펜타킬은 2점이다. 경기표와 영상 또는 보도로 확인한 대표 장면은 1점이다. 선수·챔피언당 이 보너스를 최대 3점으로 제한한다. 2026 실제 경기의 숙련도 변화는 게임 속 날짜가 해당 경기일을 지난 뒤 적용한다. [페이커 제드](https://legacies.lol/faker/) · [페이커 르블랑](https://www.invenglobal.com/articles/15075/the-best-leblanc-game-ever-played-faker-vs-mvp-blue-ogn-spring-2013) · [룰러 바루스](https://leaguerecords.com/championships/worlds/2017/88/3) · [캐니언 니달리·쵸비 아리 경기](https://www.youtube.com/watch?v=iSq2TP1ynYo&t=3979s)

커리어 집계의 챔피언별 배열은 `[출전, 승리, 보너스 근거 점수 합]`이다. 입력 CSV·선수 프로필·소속 이력의 출처와 해시를 함께 기록했다. 연도별 ChainCC 선수 파일은 `YYYY.csv.gz`로 저장한다. LeagueRecords 선수 JSON은 원장에 기록된 원본 슬러그에서 내려받고 게임 선수 ID를 파일명으로 쓴다. [재생성 명령](../../README.md#선수챔피언메타-자료)
