// 01. 가변저항(A0) 값 읽기
// Arduino: 01_read_sensor.ino 업로드 → "512" 같은 숫자를 한 줄씩 보냄
// 사용법: [아두이노 연결] 버튼 → 포트 선택

let serial;      // 아두이노와 연결하는 시리얼 객체
let value = 0;   // 아두이노에서 받은 숫자 (0 ~ 1023)

function setup() {
  createCanvas(400, 400);
  serial = createSerial();      // 시리얼 만들기 (기본 속도 9600)
  createSerialButton(serial);   // [아두이노 연결] 버튼 만들기

  // 아래 줄의 // 를 지우면, 전에 연결했던 아두이노에 버튼 없이 자동 연결됩니다.
  // serial.autoConnect();
}

function draw() {
  background(17);

  // 1. 아두이노가 보낸 가장 최근 한 줄을 가져온다. 예) "512"
  //    아직 아무것도 받지 못했다면 null(없음)이 들어있다.
  let message = serial.lastLine();

  // 2. 받은 글자가 있으면 숫자로 바꾼다.  "512"(글자) → 512(숫자)
  if (message) {
    value = int(message);
  }

  // 3. 숫자(0~1023)를 원의 크기(20~360)로 바꿔서 그린다.
  let d = map(value, 0, 1023, 20, 360);
  noStroke();
  fill(0, 200, 255);
  circle(width / 2, height / 2, d);

  // 4. 화면 아래에 글자 표시: 연결되었으면 숫자, 아니면 "연결 안 됨"
  fill(255);
  textSize(24);
  textAlign(CENTER, CENTER);
  if (serial.isOpen()) {
    text(value, width / 2, height - 40);
  } else {
    text('연결 안 됨', width / 2, height - 40);
  }
}
