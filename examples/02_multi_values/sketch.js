// 02. 센서 여러 개 값 한 번에 받기
// Arduino: 02_multi_values.ino 업로드 → "512,300,1" 처럼 쉼표로 묶은 한 줄을 보냄
//          (가변저항1, 가변저항2, 버튼)
// 사용법: [아두이노 연결] 버튼 → 포트 선택

let serial;
let pot1 = 0;     // 가변저항 1 (0 ~ 1023)
let pot2 = 0;     // 가변저항 2 (0 ~ 1023)
let button = 0;   // 버튼 (눌림 1, 안 눌림 0)

function setup() {
  createCanvas(400, 400);
  serial = createSerial();
  createSerialButton(serial);
}

function draw() {
  background(17);

  // 1. 가장 최근 한 줄 가져오기. 예) "512,300,1"
  let message = serial.lastLine();

  // 2. 쉼표(,)를 기준으로 잘라서 숫자로 바꾸기
  //    splitTokens("512,300,1", ",")  →  ["512", "300", "1"]
  if (message) {
    let parts = splitTokens(message, ',');

    // 값이 3개 모두 들어왔을 때만 사용 (중간에 잘린 줄은 무시)
    if (parts.length == 3) {
      pot1 = int(parts[0]);
      pot2 = int(parts[1]);
      button = int(parts[2]);
    }
  }

  // 3. 가변저항 1 → 파란 막대 길이
  let w1 = map(pot1, 0, 1023, 0, 300);
  noStroke();
  fill(41, 182, 246);
  rect(50, 100, w1, 40);

  // 4. 가변저항 2 → 주황 막대 길이
  let w2 = map(pot2, 0, 1023, 0, 300);
  fill(255, 167, 38);
  rect(50, 180, w2, 40);

  // 5. 버튼 → 눌리면 초록, 아니면 회색 원
  if (button == 1) {
    fill(102, 187, 106);
  } else {
    fill(70);
  }
  circle(200, 300, 80);

  // 6. 숫자 표시
  fill(255);
  textSize(16);
  text('가변저항1: ' + pot1, 50, 90);
  text('가변저항2: ' + pot2, 50, 170);
  text('버튼: ' + button, 50, 370);
}
