# 도메인 지식

## 서비스 개요

멀티체인 토큰 스왑 CLI 도구. 콘솔에서 또는 AI Agent가 프로그래밍적으로 60+ 체인에서 토큰을 스왑할 수 있다. Li.Fi SDK가 20+ DEX와 20+ 브릿지를 통합하여 최적 경로를 찾는다.

---

## 도메인 목록

1. 지갑 (Wallet)
2. 체인 (Chain)
3. 토큰 (Token)
4. 스왑 (Swap)
5. 설정 (Config)

---

## 1. 지갑 (Wallet)

```ts
WalletType: 'evm' | 'solana'
```

**저장 구조** (`~/.cli-swap/wallets/{name}.json`)
```ts
interface WalletInfo {
  name: string;          // 고유 이름
  type: 'evm' | 'solana';
  address: string;       // 공개 주소
  encryptedKey: string;  // AES-256-GCM 암호화된 private key
  iv: string;            // 초기화 벡터
  salt: string;          // scrypt salt
  authTag: string;       // GCM 인증 태그
  createdAt: string;     // ISO 8601
}
```

**비즈니스 규칙**
- 지갑 이름은 파일명으로 사용 → 영숫자 + 하이픈 권장
- 첫 번째 임포트된 지갑이 자동으로 default
- 비밀번호 최소 8자
- EVM 키: hex 64자 (0x prefix 자동 보정)
- Solana 키: base58 인코딩

---

## 2. 체인 (Chain)

Li.Fi SDK가 지원하는 60+ 체인. `getChains()` API로 동적 조회.

**주요 체인**

| Chain | ID | Key | Type |
|-------|------|-----|------|
| Ethereum | 1 | eth | EVM |
| Polygon | 137 | pol | EVM |
| Arbitrum | 42161 | arb | EVM |
| Optimism | 10 | opt | EVM |
| Base | 8453 | bas | EVM |
| BSC | 56 | bsc | EVM |
| Avalanche | 43114 | ava | EVM |
| Solana | 1151111081099710 | sol | SVM |

**체인 검색**: ID, key, name 모두 매칭 가능 (대소문자 무시)
```bash
cli-swap chains                 # 전체 목록
cli-swap tokens ethereum USDC   # "ethereum" → name 매칭
cli-swap tokens 137 USDC        # 137 → ID 매칭
cli-swap tokens pol USDC        # "pol" → key 매칭
```

---

## 3. 토큰 (Token)

Li.Fi SDK가 체인별 토큰 목록 제공. `getTokens()` / `getToken()` API.

**토큰 검색 방식**
1. **주소**: `0x` prefix + 42자 hex → `getToken(chainId, address)` 직접 조회
2. **심볼**: 대소문자 무시 매칭 → `getTokens()` → filter

**네이티브 토큰**: ETH, MATIC, SOL 등은 특수 주소 (`0x0000...` 또는 체인별 규칙)

---

## 4. 스왑 (Swap)

### 스왑 흐름

```
1. 체인 검색 (findChain)
2. 토큰 검색 (findToken)
3. 금액 변환 (parseAmount → 최소 단위)
4. 라우트 조회 (getRoutes → 최적 경로)
5. 사용자 확인 (--yes로 스킵 가능)
6. 라우트 실행 (executeRoute → 트랜잭션 서명/전송)
7. 결과 반환 (txHash, explorerUrl)
```

### 스왑 유형

| 유형 | 예시 | 설명 |
|------|------|------|
| Same-chain | ETH→USDC on Ethereum | 단일 체인 DEX 스왑 |
| Cross-chain | USDC Ethereum→Polygon | 브릿지 + 스왑 |
| Cross-ecosystem | SOL→ETH | Solana↔EVM 크로스 |

### Li.Fi Route 구조

```ts
Route {
  fromChainId: number;
  toChainId: number;
  fromAmount: string;      // 최소 단위 (wei)
  toAmount: string;        // 예상 수량
  toAmountMin: string;     // 슬리피지 반영 최소 수량
  gasCostUSD: string;
  steps: LiFiStep[];       // 실행 단계 (DEX + Bridge)
}
```

### 슬리피지

- 기본값: 0.5% (`config.defaultSlippage`)
- CLI 옵션: `--slippage 1` (= 1%)
- Li.Fi SDK에는 소수로 전달: `0.005` (= 0.5%)

---

## 5. 설정 (Config)

`~/.cli-swap/config.json`

```ts
interface AppConfig {
  defaultWallet?: string;         // 기본 지갑 이름
  defaultSlippage: number;        // 기본 슬리피지 (%, 예: 0.5)
  rpcOverrides: Record<string, string>;  // chainId → custom RPC URL
}
```

**RPC 우선순위**
1. `config.rpcOverrides[chainId]` (사용자 지정)
2. `chain.metamask.rpcUrls[0]` (Li.Fi SDK 제공)
3. `https://rpc.ankr.com/${chainKey}` (폴백)

---

## CLI 명령어

| Command | Args | Options | 설명 |
|---------|------|---------|------|
| `wallet import` | - | `--name`, `--type`, `--key`, `--password`, `--json` | 지갑 임포트 |
| `wallet list` | - | `--json` | 지갑 목록 |
| `wallet remove` | `<name>` | `--yes` | 지갑 삭제 |
| `wallet default` | `<name>` | - | 기본 지갑 설정 |
| `chains` | - | `--json`, `--type` | 체인 목록 |
| `tokens` | `<chain> [query]` | `--json`, `--limit` | 토큰 검색 |
| `balance` | `<chain>` | `--wallet`, `--json` | 잔액 조회 |
| `quote` | `<from> <fromTok> <to> <toTok> <amt>` | `--slippage`, `--wallet`, `--json` | 견적 |
| `swap` | `<from> <fromTok> <to> <toTok> <amt>` | `--slippage`, `--wallet`, `--password`, `--yes`, `--json` | 스왑 실행 |

---

## AI Agent 연동

| 플래그/환경변수 | 역할 |
|-----------------|------|
| `--json` | stdout을 JSON으로 출력 |
| `--yes` | 확인 프롬프트 스킵 |
| `--password <pw>` | 지갑 비밀번호 직접 전달 |
| `SWAP_WALLET_PASSWORD` | 환경변수로 비밀번호 전달 |
| Exit code 0 | 성공 |
| Exit code 1 | 실패 |
