<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  에이전트를 자체 컨테이너에서 안전하게 실행하는 AI 어시스턴트. 가볍고, 쉽게 이해할 수 있으며, 사용자의 필요에 맞게 완전히 커스터마이즈할 수 있도록 설계되었습니다.
</p>

<p align="center">
  <a href="https://nanoclaw.dev">nanoclaw.dev</a>&nbsp; • &nbsp;
  <a href="README_zh.md">中文</a>&nbsp; • &nbsp;
  <a href="https://discord.gg/VDdww8qS42"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord" valign="middle"></a>&nbsp; • &nbsp;
  <a href="repo-tokens"><img src="repo-tokens/badge.svg" alt="34.9k tokens, 17% of context window" valign="middle"></a>
</p>
Claude Code를 활용하여 NanoClaw는 코드를 동적으로 재작성해 사용자의 필요에 맞는 기능 세트로 커스터마이즈할 수 있습니다.

**새 기능:** [에이전트 스웜](https://code.claude.com/docs/en/agent-teams)을 지원하는 최초의 AI 어시스턴트. 채팅에서 협업하는 에이전트 팀을 구성할 수 있습니다.

## NanoClaw를 만든 이유

[OpenClaw](https://github.com/openclaw/openclaw)는 인상적인 프로젝트이지만, 제대로 이해하지 못한 복잡한 소프트웨어에 내 생활 전체의 접근 권한을 주고 편히 잠들 수는 없었습니다. OpenClaw는 약 50만 줄의 코드, 53개의 설정 파일, 70개 이상의 의존성을 가지고 있습니다. 보안은 OS 수준의 진정한 격리가 아닌 애플리케이션 수준(허용 목록, 페어링 코드)입니다. 모든 것이 공유 메모리를 가진 하나의 Node 프로세스에서 실행됩니다.

NanoClaw는 동일한 핵심 기능을 제공하되, 이해할 수 있을 만큼 작은 코드베이스로 구성됩니다: 하나의 프로세스와 소수의 파일. Claude 에이전트는 단순한 권한 검사가 아닌, 파일시스템이 격리된 자체 Linux 컨테이너에서 실행됩니다.

## 빠른 시작

```bash
git clone https://github.com/qwibitai/nanoclaw.git
cd nanoclaw
claude
```

그런 다음 `/setup`을 실행하세요. Claude Code가 의존성 설치, 인증, 컨테이너 설정, 서비스 구성 등 모든 것을 처리합니다.

> **참고:** `/`로 시작하는 명령어(`/setup`, `/add-whatsapp` 등)는 [Claude Code 스킬](https://code.claude.com/docs/en/skills)입니다. 일반 터미널이 아닌 `claude` CLI 프롬프트에서 입력하세요.

## 철학

**이해할 수 있을 만큼 작게.** 하나의 프로세스, 소수의 소스 파일, 마이크로서비스 없음. NanoClaw 코드베이스 전체를 이해하고 싶다면 Claude Code에게 안내를 요청하세요.

**격리를 통한 보안.** 에이전트는 Linux 컨테이너(macOS에서는 Apple Container, 또는 Docker)에서 실행되며 명시적으로 마운트된 것만 볼 수 있습니다. 명령어가 호스트가 아닌 컨테이너 내부에서 실행되므로 Bash 접근이 안전합니다.

**개인 사용자를 위해 설계.** NanoClaw는 거대한 프레임워크가 아니라, 각 사용자의 정확한 필요에 맞는 소프트웨어입니다. 블로트웨어가 되는 대신 맞춤형으로 설계되었습니다. 자신만의 포크를 만들고 Claude Code로 필요에 맞게 수정하세요.

**커스터마이즈 = 코드 변경.** 설정 파일 난립 없음. 다른 동작을 원하시나요? 코드를 수정하세요. 코드베이스가 충분히 작아 안전하게 변경할 수 있습니다.

**AI 네이티브.**
- 설치 마법사 없음; Claude Code가 설정을 안내합니다.
- 모니터링 대시보드 없음; Claude에게 현재 상황을 물어보세요.
- 디버깅 도구 없음; 문제를 설명하면 Claude가 해결합니다.

**기능 대신 스킬.** 코드베이스에 기능(예: 텔레그램 지원)을 추가하는 대신, 기여자들은 포크를 변환하는 `/add-telegram` 같은 [Claude Code 스킬](https://code.claude.com/docs/en/skills)을 제출합니다. 결과적으로 모든 사용 사례를 지원하려는 비대한 시스템이 아닌, 정확히 필요한 것만 하는 깔끔한 코드를 얻게 됩니다.

**최고의 하니스, 최고의 모델.** NanoClaw는 Claude Agent SDK 위에서 실행되므로 Claude Code를 직접 실행하는 것입니다. Claude Code는 매우 뛰어난 코딩 및 문제 해결 능력으로 NanoClaw를 수정·확장하고 각 사용자에 맞게 조정할 수 있습니다.

## 지원 기능

- **멀티채널 메시징** - WhatsApp, 텔레그램, 디스코드, 슬랙, Gmail에서 어시스턴트와 대화하세요. `/add-whatsapp`이나 `/add-telegram` 같은 스킬로 채널을 추가하세요. 하나 또는 여러 개를 동시에 운영할 수 있습니다.
- **격리된 그룹 컨텍스트** - 각 그룹은 자체 `CLAUDE.md` 메모리, 격리된 파일시스템을 가지며, 해당 파일시스템만 마운트된 자체 컨테이너 샌드박스에서 실행됩니다.
- **메인 채널** - 관리 제어를 위한 개인 채널(셀프 채팅); 모든 그룹은 완전히 격리됩니다.
- **예약 작업** - Claude를 실행하고 결과를 메시지로 보낼 수 있는 반복 작업
- **웹 접근** - 웹에서 콘텐츠 검색 및 가져오기
- **컨테이너 격리** - 에이전트는 Apple Container(macOS) 또는 Docker(macOS/Linux)에서 샌드박스 처리됩니다.
- **에이전트 스웜** - 복잡한 작업에 협업하는 전문 에이전트 팀을 구성하세요. NanoClaw는 에이전트 스웜을 지원하는 최초의 개인 AI 어시스턴트입니다.
- **선택적 통합** - Gmail(`/add-gmail`) 등을 스킬로 추가

## 사용법

트리거 단어(기본값: `@Andy`)로 어시스턴트와 대화하세요:

```
@Andy 매일 아침 9시에 영업 파이프라인 개요를 보내줘 (내 Obsidian 볼트 폴더에 접근 가능)
@Andy 매주 금요일에 지난 일주일간의 git 히스토리를 검토하고 차이가 있으면 README를 업데이트해줘
@Andy 매주 월요일 오전 8시에 Hacker News와 TechCrunch에서 AI 개발 뉴스를 수집해서 브리핑을 보내줘
```

메인 채널(셀프 채팅)에서 그룹과 작업을 관리할 수 있습니다:
```
@Andy 모든 그룹의 예약 작업 목록을 보여줘
@Andy 월요일 브리핑 작업을 일시 중지해줘
@Andy 가족 채팅 그룹에 참가해줘
```

## 커스터마이즈

NanoClaw는 설정 파일을 사용하지 않습니다. 변경하려면 Claude Code에게 원하는 것을 말하면 됩니다:

- "트리거 단어를 @Bob으로 변경해줘"
- "앞으로 응답을 더 짧고 직접적으로 만들어줘"
- "좋은 아침이라고 하면 맞춤 인사를 추가해줘"
- "매주 대화 요약을 저장해줘"

또는 `/customize`를 실행하면 안내에 따라 변경할 수 있습니다.

코드베이스가 충분히 작아 Claude가 안전하게 수정할 수 있습니다.

## 기여하기

**기능을 추가하지 마세요. 스킬을 추가하세요.**

텔레그램 지원을 추가하고 싶다면, WhatsApp과 함께 텔레그램을 추가하는 PR을 만들지 마세요. 대신 NanoClaw 설치를 변환하는 방법을 Claude Code에게 가르치는 스킬 파일(`.claude/skills/add-telegram/SKILL.md`)을 기여하세요.

사용자는 자신의 포크에서 `/add-telegram`을 실행하면 모든 사용 사례를 지원하려는 비대한 시스템이 아닌, 정확히 필요한 것만 하는 깔끔한 코드를 얻게 됩니다.

### RFS (스킬 요청)

보고 싶은 스킬:

**통신 채널**
- `/add-signal` - Signal을 채널로 추가

**세션 관리**
- `/clear` - 대화를 압축하는 `/clear` 명령어 추가 (동일 세션에서 중요한 정보를 보존하면서 컨텍스트를 요약). Claude Agent SDK를 통해 프로그래밍적으로 압축을 트리거하는 방법을 파악해야 합니다.

## 요구 사항

- macOS 또는 Linux
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- [Apple Container](https://github.com/apple/container) (macOS) 또는 [Docker](https://docker.com/products/docker-desktop) (macOS/Linux)

## 아키텍처

```
채널 --> SQLite --> 폴링 루프 --> 컨테이너 (Claude Agent SDK) --> 응답
```

단일 Node.js 프로세스. 채널은 스킬을 통해 추가되며 시작 시 자동 등록됩니다 — 오케스트레이터는 자격 증명이 있는 채널을 연결합니다. 에이전트는 파일시스템이 격리된 Linux 컨테이너에서 실행됩니다. 마운트된 디렉토리만 접근 가능합니다. 그룹별 메시지 큐와 동시성 제어. IPC는 파일시스템을 통해 처리됩니다.

전체 아키텍처 세부 사항은 [docs/SPEC.md](docs/SPEC.md)를 참조하세요.

주요 파일:
- `src/index.ts` - 오케스트레이터: 상태, 메시지 루프, 에이전트 호출
- `src/channels/registry.ts` - 채널 레지스트리 (시작 시 자동 등록)
- `src/ipc.ts` - IPC 감시 및 작업 처리
- `src/router.ts` - 메시지 포맷팅 및 아웃바운드 라우팅
- `src/group-queue.ts` - 그룹별 큐와 전역 동시성 제한
- `src/container-runner.ts` - 스트리밍 에이전트 컨테이너 생성
- `src/task-scheduler.ts` - 예약 작업 실행
- `src/db.ts` - SQLite 작업 (메시지, 그룹, 세션, 상태)
- `groups/*/CLAUDE.md` - 그룹별 메모리

## FAQ

**왜 Docker인가요?**

Docker는 크로스 플랫폼 지원(macOS, Linux, WSL2를 통한 Windows까지)과 성숙한 생태계를 제공합니다. macOS에서는 `/convert-to-apple-container`를 통해 더 가벼운 네이티브 런타임인 Apple Container로 선택적으로 전환할 수 있습니다.

**Linux에서 실행할 수 있나요?**

네. Docker가 기본 런타임이며 macOS와 Linux 모두에서 작동합니다. `/setup`을 실행하세요.

**안전한가요?**

에이전트는 애플리케이션 수준의 권한 검사가 아닌 컨테이너에서 실행됩니다. 명시적으로 마운트된 디렉토리에만 접근할 수 있습니다. 실행하는 것을 검토하는 것이 좋지만, 코드베이스가 충분히 작아 실제로 검토할 수 있습니다. 전체 보안 모델은 [docs/SECURITY.md](docs/SECURITY.md)를 참조하세요.

**왜 설정 파일이 없나요?**

설정 파일 난립을 원하지 않습니다. 모든 사용자가 NanoClaw를 커스터마이즈해서 코드가 정확히 원하는 것을 하도록 해야지, 범용 시스템을 설정하는 것이 아닙니다. 설정 파일을 선호한다면 Claude에게 추가하도록 요청할 수 있습니다.

**서드파티 또는 오픈소스 모델을 사용할 수 있나요?**

네. NanoClaw는 Claude API 호환 모델 엔드포인트를 모두 지원합니다. `.env` 파일에 다음 환경 변수를 설정하세요:

```bash
ANTHROPIC_BASE_URL=https://your-api-endpoint.com
ANTHROPIC_AUTH_TOKEN=your-token-here
```

다음과 같은 것을 사용할 수 있습니다:
- API 프록시를 통한 [Ollama](https://ollama.ai) 로컬 모델
- [Together AI](https://together.ai), [Fireworks](https://fireworks.ai) 등에 호스팅된 오픈소스 모델
- Anthropic 호환 API를 사용하는 커스텀 모델 배포

참고: 최상의 호환성을 위해 모델이 Anthropic API 형식을 지원해야 합니다.

**문제를 어떻게 디버깅하나요?**

Claude Code에게 물어보세요. "스케줄러가 왜 실행되지 않아?" "최근 로그에 뭐가 있어?" "이 메시지가 왜 응답을 못 받았어?" 이것이 NanoClaw의 기반이 되는 AI 네이티브 접근 방식입니다.

**설정이 작동하지 않으면 어떻게 하나요?**

문제가 있으면 설정 중에 Claude가 동적으로 해결을 시도합니다. 그래도 안 되면 `claude`를 실행한 후 `/debug`를 실행하세요. Claude가 다른 사용자에게도 영향을 미칠 수 있는 문제를 발견하면, 설정 SKILL.md를 수정하는 PR을 열어주세요.

**어떤 변경 사항이 코드베이스에 반영되나요?**

보안 수정, 버그 수정, 명확한 개선 사항만 기본 구성에 반영됩니다. 그게 전부입니다.

그 외 모든 것(새로운 기능, OS 호환성, 하드웨어 지원, 개선 사항)은 스킬로 기여해야 합니다.

이렇게 하면 기본 시스템을 최소화하고 모든 사용자가 원하지 않는 기능을 상속받지 않고 자신의 설치를 커스터마이즈할 수 있습니다.

## 커뮤니티

질문이나 아이디어가 있으신가요? [디스코드에 참가하세요](https://discord.gg/VDdww8qS42).

## 변경 로그

주요 변경 사항과 마이그레이션 참고 사항은 [CHANGELOG.md](CHANGELOG.md)를 참조하세요.

## 라이선스

MIT
