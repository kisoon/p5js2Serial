// 03. p5 → Arduino : 마우스로 LED 밝기 조절
// Arduino: 03_led_control.ino 업로드 (D9 핀에 LED)
// 마우스를 좌우로 움직이면 0 ~ 255 숫자를 아두이노로 보냄

let serial;
let ledValue = 0;    // 지금 보낼 밝기 (0 ~ 255)
let lastSent = -1;   // 마지막으로 보낸 밝기 (처음엔 아직 안 보냈으니 -1)

function setup() {
  createCanvas(400, 400);
  serial = createSerial();
  createSerialButton(serial);
}

function draw() {
  // 1. 마우스 X 위치(0 ~ 400)를 밝기(0 ~ 255)로 바꾸기
  ledValue = int(map(mouseX, 0, width, 0, 255));
  ledValue = constrain(ledValue, 0, 255);   // 화면 밖으로 나가도 0 ~ 255 유지

  // 2. 연결되어 있고, 밝기가 바뀌었을 때만 보내기
  //    (매 프레임 = 1초에 60번 보내면 아두이노가 처리를 못 해 밀림)
  if (serial.isOpen() && ledValue != lastSent) {
    serial.println(ledValue);   // "128" + 줄바꿈 전송
    lastSent = ledValue;
  }

  // 3. 화면도 같은 밝기로 칠하기
  background(ledValue, ledValue * 0.8, 0);

  // 4. 글자 표시 (배경이 밝으면 검은 글자, 어두우면 흰 글자)
  if (ledValue > 128) {
    fill(0);
  } else {
    fill(255);
  }
  textSize(32);
  textAlign(CENTER, CENTER);
  text('밝기 ' + ledValue, width / 2, height / 2);
}
