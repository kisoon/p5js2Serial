# p5js2Serial — p5.serial2.js

**Arduino Uno ↔ p5.js 2.0** 시리얼 통신 라이브러리.
브라우저에 내장된 **Web Serial API**를 사용하므로 Chrome / Edge / Brave에서 **별도 프로그램 없이** 바로 동작합니다.

> 예전 방식(`p5.serialport` + `p5.serialcontrol` 앱)은 중계 프로그램을 따로 켜야 했고, 앱이 오래되어 설치·실행 문제가 많았습니다.
> p5.serial2는 라이브러리 파일 하나만 추가하면 됩니다.

| | p5.serialport + p5.serialcontrol | **p5.serial2** |
|---|---|---|
| 중계 앱 설치 | 필요 (Electron 앱, WebSocket 서버) | **불필요** |
| p5.js 2.x 지원 | 버전별 호환성 확인 필요 | **✓** (`p5.registerAddon`, async `setup`) |
| p5.js 1.x | ✓ | ✓ (자동 호환) |
| 보드 분리 후 재연결 | 중계 앱·설정에 따라 다름 | **자동 재연결 시도** |
| 다음 방문 시 연결 | 중계 앱·설정에 따라 다름 | **권한이 유지된 포트에 `autoConnect()`로 연결 시도** |
| Uno 리셋 중 보낸 데이터 손실 | 발생 | **자동 대기 (`bootDelay`)** |
| 한글(UTF-8) 깨짐 | 발생 가능 | 처리됨 |

---

## 0. 설치

**방법 A — CDN (가장 간단, 파일 다운로드 불필요)**

```html
<script src="https://cdn.jsdelivr.net/npm/p5@2/lib/p5.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/kisoon/p5js2Serial@main/lib/p5.serial2.js"></script>
```

**방법 B — 파일 다운로드**

[`lib/p5.serial2.js`](lib/p5.serial2.js) 를 열고 **Download raw file** 버튼으로 받아 스케치 폴더에 넣습니다.
예제까지 모두 받으려면 저장소 상단 **Code → Download ZIP**.

### 폴더 구성

```
p5js2Serial/
├─ lib/
│  └─ p5.serial2.js          ← 라이브러리 (이 파일 하나만 있으면 됨)
├─ examples/
│  ├─ 01_read_sensor/        index.html, sketch.js, 01_read_sensor.ino
│  ├─ 02_multi_values/       index.html, sketch.js, 02_multi_values.ino
│  ├─ 03_led_control/        index.html, sketch.js, 03_led_control.ino
│  └─ 04_two_way/            index.html, sketch.js, 04_two_way.ino
└─ README.md
```

---

## 1. 빠른 시작

### HTML

```html
<script src="https://cdn.jsdelivr.net/npm/p5@2/lib/p5.min.js"></script>
<script src="p5.serial2.js"></script>   <!-- 반드시 p5.js 다음에 -->
<script src="sketch.js"></script>
```

### sketch.js (p5.js 2.0)

```js
let serial;
let value = 0;

function setup() {
  createCanvas(400, 400);
  serial = createSerial();        // 9600 baud
  createSerialButton(serial);     // [아두이노 연결] 버튼
  serial.autoConnect();           // 전에 허락한 포트면 버튼 없이 바로 연결
}

function draw() {
  background(220);

  let message = serial.lastLine();   // Arduino가 보낸 가장 최근 한 줄 (없으면 null)
  if (message) {
    value = int(message);            // "512"(글자) → 512(숫자)
  }

  circle(width / 2, height / 2, map(value, 0, 1023, 10, 380));
}

function mousePressed() {
  serial.println(mouseX);         // Arduino로 "123\n" 전송
}
```

### Arduino

```cpp
void setup() { Serial.begin(9600); }
void loop()  { Serial.println(analogRead(A0)); delay(20); }
```

### 실행

1. Arduino IDE로 스케치 업로드 → **Arduino IDE의 시리얼 모니터는 닫기** (포트를 하나의 프로그램만 쓸 수 있음)
2. 웹 페이지를 **로컬 서버**로 열기 (아래 중 하나)
   - VS Code **Live Server** 확장 → `Open with Live Server`
   - 터미널: `npx serve .` 또는 `python -m http.server` → `http://localhost:...`
3. **[아두이노 연결]** 버튼 → 목록에서 포트 선택 (`Arduino Uno (COM3)`, `USB-SERIAL CH340`, `/dev/cu.usbmodem...` 등)

> Web Serial은 지원 브라우저의 **secure context**에서 동작합니다. HTTPS 또는 `http://localhost` 로컬 서버 사용을 권장합니다. 루프백 주소(`http://127.0.0.1` 등)와 `file://`도 신뢰 가능한 출처로 취급될 수 있지만, 실제 사용 가능 여부는 브라우저와 권한 정책에 따라 달라집니다.

### p5.js Web Editor (editor.p5js.org) 에서 사용

에디터 미리보기 창은 시리얼 권한(`allow="serial"`)이 열려 있어서 그대로 동작합니다.

1. `index.html`에서 p5 버전을 2.x로 하고, p5 **다음 줄**에 라이브러리 추가 (CDN 사용 — 파일 업로드 불필요)
   ```html
   <script src="https://cdn.jsdelivr.net/npm/p5@2/lib/p5.min.js"></script>
   <script src="https://cdn.jsdelivr.net/gh/kisoon/p5js2Serial@main/lib/p5.serial2.js"></script>
   ```
   > 오프라인 수업 등 CDN을 쓰기 어려우면: 왼쪽 파일 목록 **`>`** → **`+`** → **Upload file** 로 `p5.serial2.js`를 올리고 `<script src="p5.serial2.js"></script>` 로 추가
2. `sketch.js` 작성 → ▶ 실행 → 미리보기의 **[아두이노 연결]** 버튼 클릭

---

## 2. 예제

`examples/` 폴더의 각 예제에는 **p5 스케치 + 짝이 되는 Arduino `.ino`** 가 함께 있습니다.

| 예제 | 내용 | 방향 |
|---|---|---|
| [`01_read_sensor`](examples/01_read_sensor) | 가변저항 값으로 원 크기 조절 | Arduino → p5 |
| [`02_multi_values`](examples/02_multi_values) | 센서 여러 개(`"512,300,1"`)를 막대와 원으로 표시 | Arduino → p5 |
| [`03_led_control`](examples/03_led_control) | 마우스 위치로 LED 밝기 조절 | p5 → Arduino |
| [`04_two_way`](examples/04_two_way) | 가변저항으로 공 움직이기 + 클릭으로 LED 켜고 끄기 | 양방향 |

**예제 실행 순서**
1. 예제 폴더의 `.ino` 파일을 Arduino IDE로 열어 업로드 (시리얼 모니터는 닫기)
2. 저장소 **최상위 폴더**에서 로컬 서버 실행 (예제가 `../../lib/p5.serial2.js`를 불러오기 때문)
   - VS Code: 폴더 열기 → `examples/01_read_sensor/index.html` 우클릭 → **Open with Live Server**
   - 또는 터미널: `npx serve .` → 브라우저에서 `http://localhost:3000/examples/01_read_sensor/`
3. **[아두이노 연결]** 클릭 → 포트 선택

p5 Web Editor에서 예제를 쓰려면 예제의 `sketch.js` 내용을 붙여넣고, `index.html`에는 위의 CDN 주소를 추가하면 됩니다.

---

## 3. API

### 만들기 / 연결

```js
serial = createSerial();                    // 기본 9600
serial = createSerial(115200);
serial = createSerial({ baudRate: 115200, filters: 'arduino' });
```

| 메서드 | 설명 |
|---|---|
| `await serial.open(baud?)` | 포트 선택 창을 띄우고 연결. **처음에는 반드시 클릭/키 입력 안에서** 호출 |
| `await serial.autoConnect(baud?)` | 이전에 허락한 포트에 창 없이 연결. `setup()`에서 사용 가능. 성공 시 `true` |
| `await serial.close()` | 새 전송을 거절하고 기존 전송을 기다린 뒤 연결 끊기. 남은 `bootDelay` + 최대 1초 대기 후 미전송 항목은 취소 |
| `await serial.forget()` | 끊고 포트 허락도 취소 (다음엔 다시 선택) |
| `await serial.reset()` | DTR/RTS 토글. Uno 등 호환 리셋 회로가 있는 보드에서 재부팅 |
| `serial.isOpen()` | 연결 여부 |
| `serial.portInfo()` | `{ usbVendorId, usbProductId }` |
| `createSerialButton(serial, opts?)` | 연결/끊기 토글 버튼 생성 (p5.Element 반환). `opts`: `label`, `disconnectLabel`, `baudRate` |
| `serialSupported()` | 브라우저 지원 여부 |

### 받기 (Arduino → p5)

| 메서드 | 반환 | 설명 |
|---|---|---|
| `lastLine()` | `string \| null` | **가장 최근에 받은 한 줄**. 버퍼를 소모하지 않음 → `draw()`에서 센서값 표시에 가장 편함 |
| `lastNumbers(sep?)` | `number[]` | `lastLine()`을 숫자 배열로. `"12,34,56"` → `[12, 34, 56]` |
| `readLine()` | `string \| null` | 다음 한 줄 꺼내기 (없으면 `null`). `\r\n` 자동 제거 |
| `readLines()` | `string[]` | 쌓인 줄 모두 꺼내기 |
| `readNumbers(sep?)` | `number[] \| null` | 다음 한 줄을 숫자 배열로 |
| `readUntil(delim)` | `string \| null` | 구분자까지 읽기 |
| `readString()` / `read()` | `string` | 쌓인 텍스트 전부 |
| `readByte()` | `number` | 1바이트 (없으면 `-1`, Arduino의 `Serial.read()`와 동일) |
| `readBytes(n?)` | `Uint8Array` | 바이트 배열 |
| `available()` | `number` | 안 읽은 바이트 수 |
| `lineCount()` | `number` | 받은 줄 개수 |
| `clear()` | | 버퍼 비우기 |

> **`lastLine()` vs `readLine()`**
> - 센서 값을 계속 받아 *현재 값만* 필요하면 → `lastLine()` / `lastNumbers()`
> - 메시지를 순서대로 처리하려면 → `readLine()` 반복 또는 `on('line')`. 단, 버퍼 초과·장치/통신 오류 시 무손실은 보장하지 않습니다. `readLine()`은 버퍼 초과 시 잘린 줄을 반환할 수 있습니다. 중요한 명령은 순번·검증·응답/재전송을 별도로 설계하세요.

### 보내기 (p5 → Arduino)

| 메서드 | 보내는 데이터 |
|---|---|
| `println(v)` | `"v\n"` |
| `println(a, b, c)` | `"a,b,c\n"` (쉼표로 연결) |
| `write('abc')` / `print('abc')` | 텍스트 그대로 |
| `write(65)` | 1바이트 (0~255) |
| `write([1, 2, 3])` / `write(Uint8Array)` | 바이트 배열 |
| `isBusy()` | 아직 보내는 중인지 |

모든 전송 메서드는 `Promise<boolean>`을 반환하지만 `await` 하지 않아도 됩니다(순서 보장).

### 이벤트

```js
serial.on('connect',    (info) => {});    // 연결됨 (재연결 포함)
serial.on('disconnect', () => {});        // 끊김 (케이블 분리 포함)
serial.on('line',       (message) => {});    // 한 줄 수신
serial.on('data',       (bytes) => {});   // 원시 바이트 수신
serial.on('error',      (err) => {});
serial.off('line', handler);
```

### 옵션 (`createSerial({...})`)

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `baudRate` | `9600` | Arduino의 `Serial.begin()` 값과 **같아야 함** |
| `filters` | `null` | `'arduino'` → Arduino/CH340/FTDI/CP210x만 목록에 표시. 또는 `[{ usbVendorId, usbProductId }]` |
| `bootDelay` | `1600` | 연결 직후 이 시간(ms) 동안 **보내기를 대기**. Uno는 포트가 열릴 때 재부팅되므로, 그 사이 보낸 데이터가 사라지는 문제를 막음. `0`이면 끔 (Leonardo/Micro 등은 `0` 가능) |
| `autoReconnect` | `true` | 권한이 유지되고 포트가 사용 가능할 때 재연결 시도. 포트 객체 또는 USB VID/PID로 판별하므로 같은 모델의 다른 보드도 선택될 수 있음 |
| `maxBuffer` | `65536` | 안 읽은 데이터 최대 보관량(바이트). 넘으면 오래된 것부터 버림 |
| `maxWriteQueue` | `4096` | 전송 대기 최대량. 넘치면 새 데이터를 버리고 경고 |
| `dataBits`, `stopBits`, `parity`, `flowControl`, `bufferSize` | 8, 1, `'none'`, `'none'`, 4096 | Web Serial 설정 그대로 |

### 인스턴스 모드

```js
new p5((p) => {
  let serial;
  p.setup = async () => {
    p.createCanvas(400, 400);
    serial = p.createSerial(115200);
    p.createSerialButton(serial);
    await serial.autoConnect();
  };
  p.draw = () => {
    let nums = serial.lastNumbers();   // "12,34" → [12, 34], 아직 없으면 []
    if (nums.length > 0) {
      p.background(nums[0]);
    }
  };
});
```

`p.remove()`를 호출하면 그 스케치가 연 포트는 자동으로 닫힙니다.

### p5 없이 사용

```js
const serial = new P5Serial2.Serial({ baudRate: 9600 });   // 또는 new p5.Serial(...)
```

---

## 4. Arduino 쪽 작성 팁

**보낼 때**: `Serial.println()`으로 한 줄씩. 여러 값은 쉼표로.

```cpp
Serial.print(a); Serial.print(','); Serial.println(b);   // "a,b"
```

**받을 때**: p5에서 `serial.println(값)`으로 보낸 한 줄을 `readStringUntil('\n')`으로 읽고 숫자로 바꿉니다 (`examples/03`, `04` 참고).

```cpp
void setup() {
  Serial.begin(9600);
  Serial.setTimeout(100);   // 기본값 1000ms면 줄바꿈이 안 올 때 1초씩 멈춤
}

void loop() {
  if (Serial.available() > 0) {
    String message = Serial.readStringUntil('\n');   // 한 줄 읽기 → "128"
    int value = message.toInt();                     // 글자 → 숫자
    analogWrite(9, value);
  }
}
```

**속도**: `delay(10~20)` 정도면 충분합니다. `delay` 없이 계속 보내면 브라우저 화면이 데이터를 따라가지 못해 늦게 반응할 수 있습니다. 예제는 모두 `9600`을 씁니다. 많이 보내야 하면 양쪽 모두 `115200`으로 바꾸세요 (`createSerial(115200)`).

**p5에서 보낼 때**: 불필요한 전송을 줄이려면 **값이 바뀔 때만** 보내세요. 초당 60회 전송 자체가 과부하를 뜻하지는 않습니다. 9600 baud, 8N1의 이론상 전송량은 약 960바이트/초이며, `"255\n"`을 초당 60회 보내면 240바이트/초입니다. 실제 한계는 메시지 길이, 수신 처리 시간, 버퍼에 따라 달라집니다. 전송 결과 `false`도 확인하세요.

---

## 5. 문제 해결

| 증상 | 해결 |
|---|---|
| 버튼이 "Web Serial 미지원 브라우저" | 데스크톱 Chrome / Edge / Brave / Opera 사용. Firefox·Safari·모바일은 미지원 |
| `navigator.serial`이 없음 | 브라우저 지원, `window.isSecureContext`, 권한 정책 확인 → HTTPS 또는 localhost 로컬 서버 권장. `file://` 자체가 항상 미지원 원인은 아님 |
| **Brave**에서 포트 창이 안 뜸 | `brave://settings/content/serialPorts` 에서 "사이트가 시리얼 포트 접근을 요청할 수 있음"이 켜져 있는지 확인. 그래도 안 되면 주소창 왼쪽 사이트 설정에서 시리얼 포트 허용, 또는 Shields 끄고 재시도 |
| 목록에 포트가 없음 | USB 케이블이 충전 전용이 아닌지 확인. 호환보드(CH340)는 드라이버 설치 필요 (Windows/구형 macOS). `filters: 'arduino'`를 썼다면 빼고 시도 |
| "이미 사용 중" / 열기 실패 | Arduino IDE 시리얼 모니터·시리얼 플로터, 다른 브라우저 탭을 닫기 |
| 업로드가 안 됨 | 브라우저가 포트를 잡고 있음 → [연결 끊기] 후 업로드 |
| 글자가 깨져서 옴 | `baudRate`가 Arduino `Serial.begin()`과 다름 |
| 연결 직후 보낸 첫 명령이 무시됨 | Uno 재부팅 중. `bootDelay`(기본 1.6초)가 처리하지만, 부트로더가 느린 보드는 `bootDelay: 2500` 처럼 늘리기 |
| `open()` 호출 시 SecurityError | `open()`은 클릭·키 입력 안에서만 가능. `setup()`에서는 `autoConnect()` 사용 |
| p5 Web Editor에서 `Infinite loop detected` / `Multiple infinite loops detected` | 에디터의 무한루프 방지 기능이 100ms 넘게 도는 반복문을 강제로 멈춰서 생김. v0.1.1에서 장시간 수신·전송 루프를 콜백 방식으로 변경했습니다. 최신 버전으로 교체하고 실제 에디터 환경에서 확인하세요. 직접 짠 코드에서 생기면 `index.html` 맨 첫 줄에 `<!-- noprotect -->` 추가 |
| `Function "line" ... conflicts with a p5.js function` 경고 | 변수 이름이 p5 함수 이름과 같음 (`line`, `log`, `brightness`, `text`, `color`, `key` 등). `message`, `ledValue`처럼 다른 이름으로 바꾸기 |
| p5 Web Editor에서 코드 수정할 때마다 연결이 끊김 | 스케치가 다시 실행되면서 포트가 닫히는 정상 동작. `autoConnect()`가 다시 연결해 줌. 신경 쓰이면 Auto-refresh 끄기 |

---

## 라이선스

[MIT](LICENSE)

## 참고

- `Promise<boolean>`의 `true`는 브라우저 쓰기 스트림에 전달됐다는 의미이며 Arduino의 명령 실행 확인은 아닙니다.
- 참고: [Web Serial 명세](https://serial.spec.whatwg.org/), [Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts), [p5.js 2.0 애드온 구현](https://github.com/processing/p5.js/blob/v2.0.0/src/core/main.js).
