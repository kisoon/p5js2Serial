// 03. p5에서 보낸 "128" 같은 숫자를 받아 LED 밝기로 사용
// 배선: D9 → 220Ω 저항 → LED(+) , LED(-) → GND

const int LED_PIN = 9;   // ~ 표시가 있는 PWM 핀

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(100);  // 한 줄을 기다리는 최대 시간(ms)
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  // 받은 데이터가 있으면
  if (Serial.available() > 0) {
    String message = Serial.readStringUntil('\n');   // 한 줄 읽기 → "128"
    int value = message.toInt();                     // 글자 → 숫자 128

    value = constrain(value, 0, 255);
    analogWrite(LED_PIN, value);
  }
}
