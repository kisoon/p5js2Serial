// 02. 여러 값을 쉼표로 묶어 한 줄로 보내기 → "512,300,1"
// 배선: 가변저항 2개 → A0, A1 / 푸시버튼 → D2와 GND (내부 풀업 사용)

const int BUTTON_PIN = 2;

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
}

void loop() {
  int pot1 = analogRead(A0);
  int pot2 = analogRead(A1);

  int button = 0;
  if (digitalRead(BUTTON_PIN) == LOW) {   // 풀업이라 누르면 LOW
    button = 1;
  }

  // "512,300,1" 형식으로 보내기
  Serial.print(pot1);
  Serial.print(",");
  Serial.print(pot2);
  Serial.print(",");
  Serial.println(button);   // 마지막 값은 println (줄바꿈 = 한 줄 끝)

  delay(20);
}
