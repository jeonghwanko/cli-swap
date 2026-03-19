cli-swap 코드베이스의 에러 처리 일관성을 검사해줘.

대상: $ARGUMENTS (없으면 전체 프로젝트 검사)

## 검사 항목

### 1. 에러 핸들링 패턴 일관성
- 모든 command action이 try-catch로 감싸져 있는지
- spinner 사용 시 에러 경로에서 `spin.fail()` 호출 후 `process.exit(1)` 하는지
- catch 블록에서 에러 타입 확인 패턴이 일관되는지:
  ```ts
  // 표준 패턴
  catch (err) {
    display.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  ```

### 2. --json 모드 에러 출력
- `--json` 옵션 사용 시 에러도 JSON으로 출력되는지
- JSON 에러 형식이 일관되는지: `{ "status": "failed", "error": "..." }`
- spinner 메시지가 JSON stdout을 오염시키지 않는지

### 3. 검증 에러 메시지
- "not found" 패턴 일관성: `'Chain "X" not found.'` vs `'Token "X" not found on Y.'`
- 검증 실패 시 도움말 제공 여부: `Run \`cli-swap chains\` to see available chains.`
- 사용자 입력 오류 vs 시스템 오류 구분 여부

### 4. 빈 catch 블록
- `catch { }` 또는 `catch { return undefined; }` 에서 에러 정보가 유실되는지
- 무시해도 되는 에러인지, 최소한 디버그 로깅이 필요한지

### 5. process.exit() 사용
- 모든 에러 경로에서 `process.exit(1)` 호출하는지
- 정상 종료 시 `process.exit(0)` 또는 자연 종료 사용하는지
- `process.exit()` 호출 전 spinner가 정리되는지

### 6. Promise 에러 전파
- async 함수의 에러가 상위로 올바르게 전파되는지
- `executeSwapRoute()`에서 에러를 삼키지 않고 `SwapResult.error`로 반환하는지
- `getSwapQuote()`에서 빈 라우트 시 명확한 에러를 throw하는지

### 7. 외부 의존성 에러
- Li.Fi SDK 에러가 사용자 친화적 메시지로 변환되는지
- 네트워크 타임아웃, RPC 에러 등이 적절히 처리되는지
- `JSON.parse()` 실패가 모든 곳에서 처리되는지

### 8. 복호화 에러 구분
- 잘못된 비밀번호 vs 손상된 데이터 구분이 정확한지
- 에러 메시지가 원인을 올바르게 안내하는지

## 출력 형식

불일치 건마다:
```
[ERROR] {카테고리} — {파일}:{줄}
  현재: {현재 에러 처리 방식}
  문제: {일관성 위반 또는 누락 설명}
  표준: {프로젝트 표준 패턴}
  제안: {수정 방법}
```

일관성이 유지되면:
```
[ERROR] ✓ 에러 처리 일관성 확인 — 모든 에러 핸들링이 표준 패턴을 따릅니다.
```

## 표준 에러 핸들링 패턴 (참고)

```ts
// commands/ 레이어 표준 패턴
const spin = display.spinner('Working...');
try {
  // ... 비즈니스 로직
  spin.stop(); // 또는 spin.succeed()
} catch (err) {
  spin.fail('Operation failed');
  if (opts.json) {
    display.jsonOutput({ status: 'failed', error: err instanceof Error ? err.message : String(err) });
  } else {
    display.error(err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
}
```
