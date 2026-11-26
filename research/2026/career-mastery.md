# 선수별 공식전 숙련도 확인 범위

2026 로스터 201명의 선수·챔피언에 연결한 경기 기록을 2013년부터 집계했다. 선수 한 명의 한 세트 출전을 한 건으로 센다. 2013~2024년 60,737건, 2025년 21,243건, 2026년 23,089건으로 합계 105,069건이다. 2026 월즈는 98세트를 결승까지 확인했다.

2013년 기록은 Leaguepedia 경기표를 정리한 LeagueRecords에서 페이커의 OGN, 한국 선발전, 월즈 출전을 확인했다. 연도별 CSV의 2014~2024 자료와 Oracle’s Elixir의 2021~2026 원장을 대조했다. Oracle 선수 ID를 우선 사용하고, 다른 출처의 기록은 확인된 닉네임·소속 또는 같은 세트의 챔피언·승패·KDA로 연결했다. 일치하는 두 출처의 세트는 한 번만 집계했다. `665`와 `POP9`는 우이한의 선수 이력 및 실제 소속을 확인해 연결했다. [LeagueRecords 페이커 2013](https://leaguerecords.com/players/faker/2013) · [Oracle’s Elixir](https://oracleselixir.com/tools/downloads) · [ChainCC, CC BY 4.0](https://chaincc.lol/free/data/) · [Pop9 선수 이력](https://liquipedia.net/leagueoflegends/POP9)

선수별·연도별 집계의 각 챔피언 값은 `[출전, 승리, 보너스 근거 점수 합]`이다. 원장과 선수 프로필의 해시, 확인된 첫 경기일, 출처별 집계와 미연결 행 수를 함께 기록했다. 일부 초기 기록은 대회 연도만 확인돼 그 해의 표본으로 집계했다. 공개 경기표가 빠진 대회와 선수 식별을 확인하기 어려운 행은 점수에 반영하지 않았다. 미연결 행에는 이름이 같은 다른 선수의 기록도 포함될 수 있다. [커리어 집계와 원자료 해시](career-match-history.json)

2025년 출전을 1로 두고 이전 연도는 한 해마다 0.8배, 최소 0.15의 가중치를 준다. 반영된 출전량과 승패로 기존 숙련 공식을 다시 계산한다. 2025년 기록이 없는 챔피언의 1~4세트 표본은 실제 출전 횟수를 기준으로 중립값에 가깝게 보정한다. 쿼드라킬은 1점, 펜타킬은 2점, 확인한 2013 OGN 서머 결승 5세트의 페이커 제드는 대표 장면 1점을 부여한다. 선수·챔피언별 보너스는 3점이 상한이다. 2026 실제 경기는 게임 안 날짜가 해당 경기를 지난 뒤에 들어간다. [페이커 제드 경기 기록](https://leaguerecords.com/players/faker/champions/zed) · [장면 자료](https://legacies.lol/faker/)

재생성할 때는 ChainCC의 연도별 선수 파일을 `YYYY.csv.gz`로 저장한다. LeagueRecords 선수 JSON은 `career-match-history.json`의 `leaguepediaProfiles`에 기록된 원본 슬러그에서 내려받은 뒤 게임 선수 ID를 파일명으로 사용한다.
