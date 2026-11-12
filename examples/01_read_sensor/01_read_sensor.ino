// 01. 가변저항 값을 한 줄씩 보내기
// 배선: 가변저항 가운데 핀 → A0, 양쪽 → 5V / GND

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(analogRead(A0));  // "512\r\n"
  delay(20);                       // 초당 50번이면 충분 (너무 빠르면 브라우저가 밀림)
}
