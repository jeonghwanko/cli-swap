# 코딩 컨벤션

## TypeScript

- strict 모드 필수 (`tsconfig.json` 상속)
- **ESM only**: `"type": "module"`
- **Import 확장자**: `.js` 확장자 포함
  ```ts
  import { loadConfig } from './config.js';     // ✅
  import { loadConfig } from './config';         // ❌
  ```
- `any` 타입 금지. `unknown` + 타입 가드 사용
- 타입 정의는 `types.ts` 단일 파일에 집중 (SSOT)

## 커맨드 등록 패턴

모든 커맨드는 `register*Command(program: Command)` 함수로 정의하고 `index.ts`에서 등록:

```ts
// commands/chains.ts
export function registerChainsCommand(program: Command): void {
  program
    .command('chains')
    .description('List all supported chains')
    .option('--json', 'Output as JSON')
    .action(async (opts) => { ... });
}
```

## 에러 처리

### commands/ 레이어
- spinner (`ora`)와 함께 사용: `spin.fail(message)` → `process.exit(1)`
- try-catch로 감싸서 사용자 친화적 메시지 출력
- `--json` 모드: `display.jsonOutput({ status: 'failed', error: msg })`

### core/ 레이어
- 검증 실패 시 `throw new Error('설명적 메시지')` — 사용자가 이해할 수 있는 메시지
- 외부 API 에러는 원본 메시지 전파 (Li.Fi SDK 에러 등)

### JSON 파일 파싱
- 모든 `JSON.parse()`에 try-catch 필수
- 손상된 config → 기본값으로 리셋
- 손상된 wallet → null 반환 (listWallets에서 스킵)

## 금액 처리 (Critical)

**절대 Number 또는 BigInt↔Number 변환 금지**. 18 decimal 토큰에서 정밀도 손실 발생.

```ts
// ✅ 올바른 방법
import { parseAmount, formatAmount } from '../utils/amount.js';
const wei = parseAmount("1.5", 18);         // "1500000000000000000"
const human = formatAmount(wei, 18);         // "1.5"

// ❌ 절대 금지
const wei = BigInt(Math.round(1.5 * 10 ** 18));  // 정밀도 손실!
const human = Number(BigInt(wei)) / 1e18;          // 정밀도 손실!
```

## 키 보안

### EVM Private Key
```ts
// 항상 ensureHexKey()로 검증 후 사용
const hexKey = ensureHexKey(rawKey);  // 0x prefix 보정 + 64 hex 검증
privateKeyToAccount(hexKey);           // 안전한 타입
```

### 암호화
- AES-256-GCM + scrypt 키 파생
- salt, iv, authTag 각각 별도 저장
- 비밀번호 최소 8자 (import 시 검증)

### 금지 사항
- 평문 키 `console.log` / 파일 기록
- 환경변수로 private key 전달 (password만 허용)
- `as 0x${string}` 직접 캐스팅 (ensureHexKey 경유 필수)

## 출력 규칙

### 일반 모드 (사람용)
- `display.heading()` → 섹션 제목
- `display.keyValue()` → 키-값 쌍
- `display.spinner()` → 로딩 표시
- `display.success()` / `display.error()` → 결과

### JSON 모드 (AI Agent용)
- `display.jsonOutput()` → `JSON.stringify(data, null, 2)`
- spinner 출력은 stderr로 (stdout은 JSON만)
- 에러도 JSON: `{ "status": "failed", "error": "..." }`

## Li.Fi SDK 사용

### 초기화
- `createConfig({ integrator: 'cli-swap' })` 한 번만 호출
- `initialized` 플래그로 중복 방지
- 쿼리 전용 vs 트랜잭션 서명용 구분

### getRoutes vs getQuote
- `getRoutes()` → `Route` 객체 반환 (executeRoute에 필요)
- `getQuote()` → `LiFiStep` 반환 (executeRoute에 사용 불가)
- **항상 `getRoutes()` 사용**

### switchChain
- `COMMON_CHAINS` 배열에서 chainId로 매칭
- 매칭 실패 시 mainnet 폴백
- 새 체인 추가 시 배열에 추가 필요

## viem 주의사항

- `Object.values(viemChains)` 사용 금지 (namespace 모듈 포함됨)
- 개별 체인 import: `import { mainnet, polygon } from 'viem/chains'`
- Chain 타입: `import { type Chain } from 'viem'`
