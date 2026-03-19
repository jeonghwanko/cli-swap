cli-swap 코드베이스의 SSOT(Single Source of Truth) 위반을 검사해줘.

대상: $ARGUMENTS (없으면 전체 프로젝트 검사)

## 검사 항목

### 1. 타입 중복 정의
- `types.ts`에 정의된 타입이 다른 파일에서 재정의되지 않았는지
- 인터페이스/타입 이름이 같지만 필드가 다른 경우
- Li.Fi SDK 타입을 재정의하지 않고 re-export하는지

### 2. 상수 중복 정의
- 체인 ID, 토큰 주소 등이 여러 파일에 하드코딩되지 않았는지
- 슬리피지 기본값이 `config.ts`의 `defaultSlippage`와 다른 곳에 중복 정의되지 않았는지
- `COMMON_CHAINS` 배열이 여러 곳에 정의되지 않았는지

### 3. 검증 로직 중복
- EVM 키 검증 (`0x` + 64 hex)이 `wallet.ts`와 `swapper.ts` 양쪽에서 일관되는지
- Solana 키 검증이 한 곳에서만 수행되는지
- 금액 변환이 항상 `utils/amount.ts`를 경유하는지 (직접 Number/BigInt 변환 없는지)

### 4. 에러 메시지 중복
- 같은 의미의 에러 메시지가 다른 문구로 여러 곳에 정의되지 않았는지
- "not found" 메시지 패턴이 일관되는지

### 5. SDK 초기화 중복
- `createConfig()` 호출이 `swapper.ts`에서만 이루어지는지
- `initialized` 플래그 관리가 일관되는지

### 6. 설정 접근 경로
- `~/.cli-swap/` 경로가 `config.ts`의 상수만으로 관리되는지
- 다른 파일에서 `homedir()` 직접 호출하지 않는지

## 출력 형식

위반 건마다:
```
[SSOT] {카테고리} — {파일A}:{줄} ↔ {파일B}:{줄}
  원본: {원본 위치와 내용}
  중복: {중복 위치와 내용}
  제안: {해결 방법 (원본 참조, 상수 추출 등)}
```

위반이 없으면:
```
[SSOT] ✓ 위반 없음 — 모든 정의가 단일 진실 원천을 따릅니다.
```

## 검사 범위

- `src/` 디렉토리 전체
- `types.ts` ↔ 각 파일의 로컬 타입 정의
- `core/config.ts` ↔ 설정 관련 상수
- `core/wallet.ts` ↔ `core/swapper.ts` 키 검증 로직
- `utils/amount.ts` ↔ 금액 변환 로직
