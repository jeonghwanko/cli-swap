cli-swap 코드베이스의 레이스 컨디션(Race Condition) 위험을 검사해줘.

대상: $ARGUMENTS (없으면 전체 프로젝트 검사)

## 검사 항목

### 1. 파일 시스템 TOCTOU (Time-of-Check Time-of-Use)
- `existsSync()` 확인 후 `readFileSync()` / `writeFileSync()` 사이에 파일 변경 가능성
- `ensureDirs()` 호출 후 디렉토리가 삭제될 가능성
- 여러 CLI 인스턴스가 동시에 같은 wallet 파일을 쓸 가능성

### 2. Li.Fi SDK 상태 경쟁
- `initialized` 플래그 체크와 `createConfig()` 호출 사이 경쟁
- `initSdk()` → `initSdkWithEvmWallet()` 순서 호출 시 두 번째 호출이 무시되는지
- 동시에 여러 스왑을 실행할 때 SDK 상태 충돌

### 3. 비동기 작업 경쟁
- `getRoutes()` 호출 후 `executeRoute()` 사이에 시세 변동
- 여러 `getChainTokens()` 호출이 동시에 발생할 때 캐시 충돌
- spinner 상태 업데이트와 에러 핸들링 사이 타이밍

### 4. 설정 파일 동시 접근
- `loadConfig()` 후 `saveConfig()` 사이에 다른 프로세스가 config 수정
- 지갑 `import` 중 같은 이름으로 다른 프로세스가 먼저 생성

### 5. 환경변수 경쟁
- `process.env['SWAP_WALLET_PASSWORD']` 읽기와 사용 사이 변경 가능성
- 런타임 중 환경변수 변경이 영향을 미치는지

## 출력 형식

위험 건마다:
```
[RACE] {심각도: HIGH|MEDIUM|LOW} — {파일}:{줄}
  패턴: {TOCTOU|STATE_RACE|ASYNC_RACE|CONCURRENT_WRITE}
  설명: {어떤 경쟁 상태가 발생할 수 있는지}
  시나리오: {구체적인 재현 시나리오}
  제안: {락, 원자적 연산, 재시도 등 해결 방법}
```

위험이 없으면:
```
[RACE] ✓ 레이스 컨디션 위험 없음
```

## 참고

CLI 도구 특성상 단일 프로세스 실행이 일반적이지만, 다음 상황을 고려:
- 여러 터미널에서 동시 실행
- AI Agent가 병렬로 여러 스왑 실행
- cron job 등 자동화 스크립트에서 동시 호출
