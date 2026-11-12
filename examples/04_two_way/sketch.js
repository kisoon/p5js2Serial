// 04. 양방향 통신 : 받으면서 동시에 보내기
// Arduino: 04_two_way.ino 업로드
//   Arduino → p5 : "512,1"  (가변저항, 버튼)
//   p5 → Arduino : "1" 또는 "0"  (13번 LED 켜기 / 끄기)
// 사용법: [아두이노 연결] → 가변저항을 돌리면 공이 움직이고,
//         화면을 클릭하면 아두이노의 LED가 켜졌다 꺼졌다 함

let serial;
let pot = 0;          // 가변저항 (0 ~ 1023)
let button = 0;       // 버튼 (1 / 0)
let ledOn = false;    // LED가 켜져 있는지 (true / false)

function setup() {
  createCanvas(400, 400);
  serial = createSerial();
  createSerialButton(serial);
}

function draw() {
  background(17);

  // ---------- 받기 ----------
  let message = serial.lastLine();   // 예) "512,1"
  if (message) {
    let parts = splitTokens(message, ',');
    if (parts.length == 2) {
      pot = int(parts[0]);
      button = int(parts[1]);
    }
  }

  // 가변저항 → 공의 x 위치, 버튼 → 공 색깔
  let x = map(pot, 0, 1023, 30, width - 30);
  if (button == 1) {
    fill(102, 187, 106);   // 초록
  } else {
    fill(41, 182, 246);    // 파랑
  }
  noStroke();
  circle(x, 200, 60);

  // ---------- 상태 표시 ----------
  fill(255);
  textSize(16);
  text('가변저항: ' + pot, 20, 320);
  text('버튼: ' + button, 20, 345);
  if (ledOn) {
    text('LED: 켜짐 (클릭하면 끄기)', 20, 370);
  } else {
    text('LED: 꺼짐 (클릭하면 켜기)', 20, 370);
  }
}

// ---------- 보내기 ----------
// 캔버스를 클릭할 때마다 LED 켜기 ↔ 끄기
function mousePressed() {
  // 아직 연결 전이면 아무것도 하지 않음
  if (serial.isOpen() == false) {
    return;
  }

  // 캔버스 밖(아래쪽 연결 버튼 등)을 클릭한 경우도 무시
  if (mouseY < 0 || mouseY > height) {
    return;
  }

  ledOn = !ledOn;   // true ↔ false 뒤집기

  if (ledOn) {
    serial.println(1);   // "1" 보내기 → 켜기
  } else {
    serial.println(0);   // "0" 보내기 → 끄기
  }
}
