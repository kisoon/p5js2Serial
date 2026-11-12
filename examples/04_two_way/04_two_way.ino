// 04. 양방향 통신 : 센서 값을 보내면서 동시에 명령 받기
// 보내기: "512,1"  (가변저항, 버튼)
// 받기  : "1" → 13번 LED 켜기 / "0" → 끄기
// 배선: 가변저항 → A0 / 버튼 → D2와 GND / LED는 보드에 있는 13번(L) 사용

const int BUTTON_PIN = 2;

void setup() {
  Serial.begin(9600);
  Serial.setTimeout(100);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);   // Uno에서는 LED_BUILTIN = 13번 핀 (보드에 따라 다름)
}

void loop() {
  // ---------- 받기 ----------
  if (Serial.available() > 0) {
    String message = Serial.readStringUntil('\n');   // "1" 또는 "0"
    int command = message.toInt();

    if (command == 1) {
      digitalWrite(LED_BUILTIN, HIGH);
    } else {
      digitalWrite(LED_BUILTIN, LOW);
    }
  }

  // ---------- 보내기 ----------
  int pot = analogRead(A0);
  int button = 0;
  if (digitalRead(BUTTON_PIN) == LOW) {
    button = 1;
  }

  Serial.print(pot);
  Serial.print(",");
  Serial.println(button);   // "512,1"

  delay(20);
}
