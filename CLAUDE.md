# CLAUDE.md - cli-swap

## Project Overview

멀티체인 토큰 스왑 CLI. Li.Fi SDK(60+ 체인)를 통해 콘솔 또는 AI Agent가 어떤 토큰이든 스왑할 수 있다.

## Quick Start

```bash
npm install
npm run dev -- --help          # 개발 모드 실행
npm run build                  # TypeScript 빌드
node dist/index.js --help      # 빌드 후 실행
```

## Tech Stack

| Layer | Tech |
|-------|------|
| CLI Framework | Commander.js |
| Swap Aggregator | Li.Fi SDK (`@lifi/sdk`) — 60+ 체인, 20+ DEX/브릿지 |
| EVM Wallet | viem + ethers.js v6 |
| Solana Wallet | @solana/web3.js |
| Key Encryption | AES-256-GCM (Node.js crypto) |
| UX | chalk + ora + inquirer |
| Language | TypeScript (ESM strict mode) |

## Commands

```bash
npm run dev -- wallet import   # 지갑 임포트
npm run dev -- chains          # 지원 체인 목록
npm run dev -- tokens eth USDC # 토큰 검색
npm run dev -- balance eth     # 잔액 조회
npm run dev -- quote eth USDC polygon USDC 100   # 견적
npm run dev -- swap eth USDC polygon USDC 100     # 스왑 실행

# 빌드
npm run build
npx tsc --noEmit               # 타입 체크
```

## Project Structure

```
cli-swap/
├── src/
│   ├── index.ts              # CLI 엔트리 (Commander.js)
│   ├── types.ts              # 공통 타입 (WalletInfo, SwapParams, QuoteResult 등)
│   ├── commands/
│   │   ├── wallet.ts         # wallet import/list/remove/default
│   │   ├── chains.ts         # 지원 체인 목록 조회
│   │   ├── tokens.ts         # 토큰 검색
│   │   ├── balance.ts        # 잔액 조회
│   │   ├── quote.ts          # 스왑 견적 (실행 없이)
│   │   └── swap.ts           # 스왑 실행 (견적 → 확인 → 실행)
│   ├── core/
│   │   ├── config.ts         # ~/.cli-swap/config.json 관리
│   │   ├── wallet.ts         # 지갑 CRUD + 암호화/복호화
│   │   └── swapper.ts        # Li.Fi SDK 래퍼 (getRoutes + executeRoute)
│   └── utils/
│       ├── amount.ts         # 토큰 금액 변환 (문자열 기반, 정밀도 유지)
│       ├── crypto.ts         # AES-256-GCM 암/복호화
│       ├── display.ts        # 터미널 출력 (chalk, ora)
│       └── prompt.ts         # 사용자 입력 (inquirer)
├── package.json
├── tsconfig.json
└── README.md
```

## Coding Conventions

### General
- **ESM only**: `"type": "module"`, `.js` 확장자 포함
- **TypeScript strict mode**: `strict: true`
- **No `any`**: `unknown` + 타입 가드 사용

### 아키텍처 레이어
- **commands/**: CLI 인터페이스 (파싱, 출력 포맷팅)
- **core/**: 비즈니스 로직 (SDK 호출, 지갑 관리, 설정)
- **utils/**: 순수 유틸리티 (암호화, 금액 변환, 터미널 출력)

### 금액 처리
- **문자열 연산만 사용**: `parseAmount()` / `formatAmount()` — Number/BigInt 변환 금지 (18 decimal 정밀도 손실)
- `parseAmount("1.5", 18)` → `"1500000000000000000"`
- `formatAmount("1500000000000000000", 18)` → `"1.5"`

### 키 보안
- Private key는 AES-256-GCM 암호화 후 `~/.cli-swap/wallets/`에 저장
- 평문 키는 절대 로깅/출력 금지
- EVM 키: `0x` prefix 자동 보정 + hex 64자 검증
- Solana 키: base58 디코딩 검증

### AI Agent 모드
- `--json`: 모든 출력 JSON
- `--yes`: 확인 프롬프트 스킵
- `--password` 또는 `SWAP_WALLET_PASSWORD` 환경변수
- Exit code: 0=성공, 1=실패

## 파일 저장

```
~/.cli-swap/
├── config.json          # 설정 (defaultWallet, slippage, rpcOverrides)
└── wallets/
    └── {name}.json      # 암호화된 지갑 (AES-256-GCM)
```

## 상세 문서

- [아키텍처](.claude/rules/architecture.md) — 시스템 구조, 레이어 규칙, 데이터 흐름
- [코딩 컨벤션](.claude/rules/coding-conventions.md) — TypeScript, 보안, 금액 처리 규칙
- [도메인 지식](.claude/rules/domain-knowledge.md) — 체인, 토큰, 스왑 흐름, Li.Fi SDK 사용법

## Key Gotchas

1. **viem chains namespace**: `Object.values(viemChains)`는 모듈 자체도 포함 → 별도 `COMMON_CHAINS` 배열 사용
2. **Li.Fi getQuote vs getRoutes**: `getQuote`는 `LiFiStep` 반환, `getRoutes`가 `Route` 반환 → `executeRoute`에는 `Route` 필요
3. **금액 정밀도**: `Number(BigInt(...))` → 18 decimal 토큰에서 정밀도 손실 → `parseAmount`/`formatAmount` 문자열 연산 사용
4. **EVM 키 0x prefix**: viem `privateKeyToAccount`는 `0x` prefix 필수 → `ensureHexKey()` 검증 함수
5. **JSON 파일 손상**: `~/.cli-swap/` 파일이 손상될 수 있음 → 모든 JSON.parse에 try-catch + 복구 로직
6. **Li.Fi SDK 초기화**: `createConfig()`는 한 번만 호출, `initialized` 플래그로 관리
