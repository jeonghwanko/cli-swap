# 아키텍처 규칙

## 프로젝트 구조

```
cli-swap/
├── src/
│   ├── index.ts          # CLI 엔트리포인트 (Commander.js 프로그램 정의)
│   ├── types.ts          # 공통 타입 정의 (단일 진실 원천)
│   ├── commands/         # CLI 인터페이스 레이어
│   ├── core/             # 비즈니스 로직 레이어
│   └── utils/            # 순수 유틸리티 (부작용 없음)
├── package.json
└── tsconfig.json
```

## 레이어 규칙

### commands/ → core/ → utils/

```
commands/  ──► core/   ──► utils/
(CLI I/O)     (로직)      (순수 함수)
```

- **commands/** → core/, utils/ 임포트 가능. 다른 command 임포트 금지
- **core/** → utils/ 임포트 가능. commands/ 임포트 금지
- **utils/** → 외부 의존성만. core/, commands/ 임포트 금지
- **types.ts** → 어디서든 임포트 가능 (공유 타입)

### 레이어별 책임

| 레이어 | 책임 | 금지 |
|--------|------|------|
| `commands/` | CLI 파싱, 사용자 I/O, 출력 포맷팅 | SDK 직접 호출, 암호화 직접 수행 |
| `core/config.ts` | `~/.cli-swap/` 디렉토리/파일 관리 | 네트워크 호출 |
| `core/wallet.ts` | 지갑 CRUD, 키 검증, 암호화 저장 | Li.Fi SDK 호출 |
| `core/swapper.ts` | Li.Fi SDK 초기화/호출, 라우트 실행 | 파일 I/O, 사용자 입력 |
| `utils/amount.ts` | 토큰 금액 문자열 변환 | 외부 API 호출, 부작용 |
| `utils/crypto.ts` | AES-256-GCM 암/복호화 | 파일 I/O |
| `utils/display.ts` | chalk/ora 터미널 출력 | 로직 수행 |
| `utils/prompt.ts` | inquirer 사용자 입력 | 로직 수행 |

## 데이터 흐름

### 스왑 실행 흐름

```
사용자 입력 (CLI args)
    │
    ▼
commands/swap.ts
    ├── core/wallet.ts     → 지갑 잠금 해제 (decrypt)
    ├── core/swapper.ts    → SDK 초기화 (initSdkWithEvmWallet)
    ├── core/swapper.ts    → 체인/토큰 검색 (findChain, findToken)
    ├── utils/amount.ts    → 금액 변환 (parseAmount)
    ├── core/swapper.ts    → 견적 조회 (getSwapQuote)
    ├── utils/prompt.ts    → 사용자 확인 (askConfirm)
    ├── core/swapper.ts    → 스왑 실행 (executeSwapRoute)
    └── utils/display.ts   → 결과 출력
```

### Li.Fi SDK 초기화 패턴

```
initSdk()                    → 쿼리 전용 (지갑 없음)
initSdkWithEvmWallet(key)    → EVM 트랜잭션 서명 가능
initSdkWithSolanaWallet(key) → Solana 트랜잭션 서명 가능
initSdkWithBothWallets(...)  → 크로스 에코시스템 스왑
```

- `initialized` 플래그로 중복 초기화 방지
- EVM: viem `createWalletClient` + `switchChain` 콜백
- Solana: `KeypairWalletAdapter`

## 파일 저장 구조

```
~/.cli-swap/
├── config.json              # AppConfig (defaultWallet, slippage, rpcOverrides)
└── wallets/
    └── {walletName}.json    # WalletInfo (AES-256-GCM 암호화 키)
```

- JSON 파일 손상 시 자동 복구 (config → 기본값 리셋, wallet → null 반환)
- 디렉토리 자동 생성 (`ensureDirs()`)

## 외부 의존성 역할

| 패키지 | 역할 | 사용 위치 |
|--------|------|-----------|
| `@lifi/sdk` | 멀티체인 스왑 라우팅/실행 | `core/swapper.ts` |
| `viem` | EVM wallet client 생성 | `core/swapper.ts` |
| `ethers` | EVM 키 검증, 잔액 조회 | `core/wallet.ts`, `commands/balance.ts` |
| `@solana/web3.js` | Solana 키 검증, 잔액 조회 | `core/wallet.ts`, `commands/balance.ts` |
| `commander` | CLI 프레임워크 | `index.ts`, `commands/` |
| `inquirer` | 인터랙티브 프롬프트 | `utils/prompt.ts` |
| `chalk` / `ora` | 터미널 UI | `utils/display.ts` |
