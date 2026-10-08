#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Adafruit_Fingerprint.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ========================================================
// --- SaaS Hardware Configuration ---
// ========================================================
const char* ssid = "Bashir Uddin";
const char* password = "0506986654";

// SaaS Server URL (Without https://)
const char* serverHost = "jh5nng6t-3000.asse.devtunnels.ms";
const uint16_t serverPort = 443;

// Organization Unique Token
const char* deviceToken = "org_live_fd0a71695792a03bccd8f86553ad7f54"; 

// ========================================================
// --- OLED Display Settings ---
// ========================================================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- Fingerprint Sensor ---
SoftwareSerial mySerial(4, 0); // TX -> D2, RX -> D3
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);

// --- RC522 RFID ---
#define RST_PIN 16 // D0
#define SS_PIN  15 // D8
MFRC522 mfrc522(SS_PIN, RST_PIN);

// State Variables
String currentMode = "attendance";
String enrollType = "";
int targetId = 0;
String orgName = "SaaS Attendance"; // Dynamic organization name
unsigned long lastPollTime = 0;
const unsigned long pollInterval = 2000; // Poll every 2 seconds
bool serverOnline = false;
unsigned long lastAnimTime = 0;
int animFrame = 0;

// Idle Screen Animation State ("Clean Stage" concept)
// Fixed inverted header + one big clear message + a small living animation next to it.
#define NUM_PAGES 4
const unsigned long PAGE_DURATION = 2400;      // time a page stays on screen
const unsigned long TRANSITION_DURATION = 500; // window-blinds transition
int currentPage = 0;
unsigned long pageStart = 0;

void updateDisplay(String title, String msg1, String msg2 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(title);
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  display.setCursor(0, 20);
  display.println(msg1);
  if (msg2 != "") {
    display.setCursor(0, 35);
    display.println(msg2);
  }
  display.display();
}

// 16x16 Fingerprint Icon
const unsigned char epd_bitmap_fingerprint [] PROGMEM = {
	0x03, 0xc0, 0x0c, 0x30, 0x10, 0x08, 0x27, 0xe4, 0x28, 0x14, 0x51, 0x8a, 0x52, 0x4a, 0xaa, 0xaa, 
	0xa5, 0x5a, 0xa4, 0x2a, 0x98, 0x1a, 0x80, 0x0a, 0x47, 0xe2, 0x48, 0x12, 0x30, 0x0c, 0x0f, 0xf0
};

// 16x16 RFID Card Icon
const unsigned char epd_bitmap_rfid [] PROGMEM = {
	0xff, 0xff, 0x80, 0x01, 0x9f, 0xf9, 0x90, 0x09, 0x90, 0x09, 0x90, 0x09, 0x91, 0x89, 0x93, 0xc9, 
	0x93, 0xc9, 0x91, 0x89, 0x90, 0x09, 0x9f, 0xf9, 0x80, 0x01, 0x80, 0x01, 0xff, 0xff, 0x00, 0x00
};

// ========================================================
// --- Idle Screen: "Clean Stage" animation helpers ---
// ========================================================

// Ease-out slide-in offset (text flies in from the right when a page appears)
int slideIn(unsigned long lt) {
  if (lt >= 300) return 0;
  float p = 1.0 - (float)lt / 300.0;
  return (int)(p * p * 70);
}

// Draw text horizontally centered (with optional x shift)
void printCentered(const char* txt, int size, int y, int dx = 0) {
  int16_t x1, y1; uint16_t w, h;
  display.setTextSize(size);
  display.setTextColor(SSD1306_WHITE);
  display.getTextBounds(txt, 0, 0, &x1, &y1, &w, &h);
  display.setCursor((128 - (int)w) / 2 + dx, y);
  display.print(txt);
}

// Twinkling "+" sparkle
void drawTwinkle(int x, int y, unsigned long t) {
  static const int8_t seq[8] = {0, 1, 2, 1, 0, -1, -1, -1};
  int r = seq[(t / 110) % 8];
  if (r < 0) return;
  display.drawPixel(x, y, SSD1306_WHITE);
  if (r > 0) {
    display.drawFastHLine(x - r, y, 2 * r + 1, SSD1306_WHITE);
    display.drawFastVLine(x, y - r, 2 * r + 1, SSD1306_WHITE);
  }
}

// A light band that sweeps over a text box (inverts pixels, text stays readable)
void shimmer(int x, int y, int w, int h, unsigned long lt, unsigned long period) {
  int bx = x + (int)((lt % period) * (unsigned long)(w + 30) / period) - 15;
  int bw = 8;
  if (bx < x) { bw -= (x - bx); bx = x; }
  if (bx + bw > x + w) bw = x + w - bx;
  if (bw > 0) display.fillRect(bx, y, bw, h, SSD1306_INVERSE);
}

// Header bar: inverted (white bar, black text). Long names scroll like a ticker.
void drawHeader(unsigned long now) {
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextSize(1);
  display.setTextColor(SSD1306_BLACK);
  display.setTextWrap(false);
  int16_t x1, y1; uint16_t w, h;
  display.getTextBounds(orgName, 0, 0, &x1, &y1, &w, &h);
  if ((int)w <= 122) {
    display.setCursor((128 - (int)w) / 2, 2);
    display.print(orgName);
  } else {
    int gap = 30;
    int off = (now / 35) % (w + gap);
    display.setCursor(2 - off, 2);
    display.print(orgName);
    display.setCursor(2 - off + w + gap, 2);
    display.print(orgName);
  }
  display.setTextWrap(true);
  display.setTextColor(SSD1306_WHITE);
}

// Dotted frame with a bright dash chasing around it (never touches the text)
void drawChaseBorder(unsigned long now) {
  const int x0 = 0, y0 = 13, x1 = 127, y1 = 63;
  const int w = x1 - x0, h = y1 - y0;
  const int per = 2 * (w + h);
  for (int p = 0; p < per; p += 4) {
    int px, py;
    if (p < w) { px = x0 + p; py = y0; }
    else if (p < w + h) { px = x1; py = y0 + (p - w); }
    else if (p < 2 * w + h) { px = x1 - (p - w - h); py = y1; }
    else { px = x0; py = y1 - (p - 2 * w - h); }
    display.drawPixel(px, py, SSD1306_WHITE);
  }
  int head = (now / 6) % per;
  for (int i = 0; i < 20; i++) {
    int p = (head - i + per) % per;
    int px, py;
    if (p < w) { px = x0 + p; py = y0; }
    else if (p < w + h) { px = x1; py = y0 + (p - w); }
    else if (p < 2 * w + h) { px = x1 - (p - w - h); py = y1; }
    else { px = x0; py = y1 - (p - 2 * w - h); }
    display.drawPixel(px, py, SSD1306_WHITE);
    if (i < 8) { // thicker head
      if (py == y0) display.drawPixel(px, py + 1, SSD1306_WHITE);
      else if (py == y1) display.drawPixel(px, py - 1, SSD1306_WHITE);
      else if (px == x1) display.drawPixel(px - 1, py, SSD1306_WHITE);
      else display.drawPixel(px + 1, py, SSD1306_WHITE);
    }
  }
}

void drawPageContent(int pageIdx, unsigned long lt) {
  int dx = slideIn(lt);

  if (pageIdx == 0) {
    // ---- WELCOME: big text, light shimmer, bouncing dots, twinkles ----
    printCentered("WELCOME", 2, 22, 0);
    shimmer(22, 20, 84, 19, lt, 1500);
    drawTwinkle(12, 26, lt);
    drawTwinkle(116, 24, lt + 330);
    drawTwinkle(110, 45, lt + 660);
    drawTwinkle(16, 44, lt + 220);
    for (int i = 0; i < 5; i++) {
      float b = fabsf(sinf((float)lt / 130.0 - i * 0.7)) * 6.0;
      display.fillCircle(44 + i * 10, 54 - (int)b, 2, SSD1306_WHITE);
    }
  }
  else if (pageIdx == 1) {
    // ---- PLACE FINGER: fingerprint + ripples + scan line (left), big text (right) ----
    display.drawBitmap(14, 30, epd_bitmap_fingerprint, 16, 16, SSD1306_WHITE);
    int r1 = 11 + (lt / 90) % 8;
    int r2 = 11 + ((lt / 90) + 4) % 8;
    display.drawCircle(22, 38, r1, SSD1306_WHITE);
    display.drawCircle(22, 38, r2, SSD1306_WHITE);
    int tri = (lt / 25) % 32;            // triangle wave 0..16..0
    if (tri > 16) tri = 32 - tri;
    display.drawFastHLine(12, 30 + tri, 20, SSD1306_INVERSE);

    display.setTextSize(2);
    display.setCursor(48 + dx, 22);
    display.print("PLACE");
    display.setCursor(48 + dx, 41);
    display.print("FINGER");
    shimmer(48, 22, 72, 36, lt, 1400);
  }
  else if (pageIdx == 2) {
    // ---- TAP CARD: card + radiating signal arcs (left), big text (right) ----
    int dy = (int)(sinf((float)lt / 160.0) * 2.0);
    display.drawRoundRect(3, 31 + dy, 24, 16, 3, SSD1306_WHITE);
    display.fillRect(3, 35 + dy, 24, 3, SSD1306_WHITE);
    display.drawRect(7, 41 + dy, 6, 4, SSD1306_WHITE);
    int n = (lt / 170) % 4;
    for (int k = 0; k < n; k++) {
      display.drawCircleHelper(32, 39, 4 + k * 5, 0x6, SSD1306_WHITE);
      display.drawCircleHelper(33, 39, 4 + k * 5, 0x6, SSD1306_WHITE);
    }

    display.setTextSize(2);
    display.setCursor(58 + dx, 22);
    display.print("TAP");
    display.setCursor(58 + dx, 41);
    display.print("CARD");
    shimmer(58, 22, 48, 36, lt, 1400);
  }
  else if (pageIdx == 3) {
    // ---- POWERED BY ARAFLOGIX: special company screen ----
    printCentered("POWERED BY", 1, 19, -dx);
    printCentered("ARAFLOGIX", 2, 33, dx);
    shimmer(10, 31, 108, 19, lt, 1300);

    // Underline grows from the center and repeats
    int len = (int)((lt % 1600) * 108UL / 1000UL);
    if (len > 108) len = 108;
    display.drawFastHLine(64 - len / 2, 54, len, SSD1306_WHITE);

    // Pulsing corner brackets around the name
    int o = (lt / 180) % 3;
    int bx0 = 4 - o, by0 = 28 - o, bx1 = 123 + o, by1 = 52 + o;
    display.drawFastHLine(bx0, by0, 6, SSD1306_WHITE);
    display.drawFastVLine(bx0, by0, 6, SSD1306_WHITE);
    display.drawFastHLine(bx1 - 5, by0, 6, SSD1306_WHITE);
    display.drawFastVLine(bx1, by0, 6, SSD1306_WHITE);
    display.drawFastHLine(bx0, by1, 6, SSD1306_WHITE);
    display.drawFastVLine(bx0, by1 - 5, 6, SSD1306_WHITE);
    display.drawFastHLine(bx1 - 5, by1, 6, SSD1306_WHITE);
    display.drawFastVLine(bx1, by1 - 5, 6, SSD1306_WHITE);

    drawTwinkle(14, 20, lt);
    drawTwinkle(113, 21, lt + 400);
  }
}

void drawIdleScreen() {
  unsigned long now = millis();
  if (pageStart == 0) pageStart = now;

  unsigned long elapsed = now - pageStart;
  unsigned long lt = elapsed;       // local animation time of the visible page
  int pageToDraw = currentPage;
  float cover = 0;                  // 0..1 how closed the blinds are

  if (elapsed > PAGE_DURATION) {
    unsigned long t = elapsed - PAGE_DURATION;
    if (t >= TRANSITION_DURATION) {
      currentPage = (currentPage + 1) % NUM_PAGES;
      pageStart = now - TRANSITION_DURATION / 2;
      pageToDraw = currentPage;
      lt = TRANSITION_DURATION / 2; // continues seamlessly from the reveal
    } else {
      float p = (float)t / TRANSITION_DURATION;
      if (p < 0.5) {
        cover = p * 2.0;            // blinds closing on old page
      } else {
        pageToDraw = (currentPage + 1) % NUM_PAGES;
        cover = 2.0 - p * 2.0;      // blinds opening on new page
        lt = t - TRANSITION_DURATION / 2; // new page animation starts at 0
      }
    }
  }
  display.clearDisplay();
  drawPageContent(pageToDraw, lt);

  // Window-blinds transition (class-room style shutters)
  if (cover > 0) {
    int hh = (int)(cover * 8.0 + 0.5);
    for (int y = 12; y < 64; y += 8) {
      display.fillRect(0, y, 128, hh, SSD1306_BLACK);
      if (hh > 0 && hh < 8) display.drawFastHLine(0, y + hh, 128, SSD1306_WHITE);
    }
  }

  drawChaseBorder(now);
  drawHeader(now);
  display.display();
}

void showSuccessAnimation(String name) {
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("WELCOME!");
  display.setTextSize(1);
  display.setCursor(0, 25);
  display.println("Hello,");
  display.setCursor(0, 40);
  display.println(name);
  
  // Cute face graphic
  display.drawCircle(105, 32, 16, SSD1306_WHITE);
  display.fillCircle(99, 27, 2, SSD1306_WHITE);
  display.fillCircle(111, 27, 2, SSD1306_WHITE);
  display.drawLine(98, 38, 112, 38, SSD1306_WHITE);
  display.drawLine(100, 40, 110, 40, SSD1306_WHITE);
  
  display.display();
  delay(3000);
}

void animateWait(String title, String msg1, String msg2) {
  if (millis() - lastAnimTime > 500) {
    lastAnimTime = millis();
    animFrame = (animFrame + 1) % 4;
    String dots = "";
    for(int i=0; i<animFrame; i++) dots += ".";
    updateDisplay(title, msg1, msg2 + dots);
  }
}

// --- HTTP Helpers ---
String sendPostRequest(String endpoint, String payload) {
  if (WiFi.status() != WL_CONNECTED) return "";
  
  WiFiClientSecure client;
  client.setInsecure(); // Bypass SSL verification for HTTPS
  
  HTTPClient http;
  String url = "https://" + String(serverHost) + endpoint;
  
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", deviceToken);
  http.addHeader("X-Tunnel-Skip-AntiPhishing-Page", "true");
  
  int httpCode = http.POST(payload);
  String response = "";
  if (httpCode > 0) {
    if (httpCode == HTTP_CODE_OK) {
      response = http.getString();
    }
  } else {
    Serial.printf("[HTTP] POST failed, error: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();
  return response;
}

void pollServerCommand() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  String url = "https://" + String(serverHost) + "/api/command";
  
  http.begin(client, url);
  http.addHeader("x-device-token", deviceToken);
  http.addHeader("X-Tunnel-Skip-AntiPhishing-Page", "true");
  
  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    serverOnline = true;
    
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      String newMode = doc["mode"].as<String>();
      if (doc["orgName"]) orgName = doc["orgName"].as<String>();
      
      if (newMode != currentMode) {
        currentMode = newMode;
        if (doc["id"]) targetId = doc["id"].as<int>();
        if (doc["enrollType"]) enrollType = doc["enrollType"].as<String>();
        else enrollType = "fingerprint";
        
        if (currentMode == "enroll") {
          updateDisplay("ENROLL MODE", enrollType == "rfid" ? "RFID Selected" : ("New User ID: " + String(targetId)), "Please scan...");
        } else if (currentMode == "attendance") {
          drawIdleScreen();
        } else if (currentMode == "delete") {
          updateDisplay("DELETE MODE", "Deleting ID: " + String(targetId), "Please wait...");
        }
      }
    }
  } else {
    serverOnline = false;
  }
  http.end();
}

void sendAttendanceLog(String id, String type) {
  DynamicJsonDocument doc(512);
  if (type == "fingerprint") doc["fingerprintId"] = id.toInt();
  else doc["rfidUid"] = id;
  
  String payload;
  serializeJson(doc, payload);
  
  String res = sendPostRequest("/api/attendance", payload);
  if (res != "") {
    DynamicJsonDocument resDoc(512);
    deserializeJson(resDoc, res);
    if (resDoc["name"]) {
      showSuccessAnimation(resDoc["name"].as<String>());
      drawIdleScreen();
    }
  } else {
    updateDisplay("FAILED", "Server Unreachable", "Offline Punch Saved.");
    delay(2000);
    drawIdleScreen();
  }
}

void reportProgress(String message) {
  DynamicJsonDocument doc(512);
  doc["message"] = message;
  String payload;
  serializeJson(doc, payload);
  sendPostRequest("/api/enroll_progress", payload);
}

void sendEnrollSuccess(String id, String type) {
  DynamicJsonDocument doc(512);
  if (type == "fingerprint") doc["fingerprintId"] = id.toInt();
  else doc["rfidUid"] = id;
  String payload;
  serializeJson(doc, payload);
  sendPostRequest("/api/enroll_success", payload);
}

// --- Check Functions ---
void checkAttendance() {
  // Check Fingerprint
  uint8_t p = finger.getImage();
  if (p == FINGERPRINT_OK) {
    p = finger.image2Tz();
    if (p == FINGERPRINT_OK) {
      p = finger.fingerFastSearch();
      if (p == FINGERPRINT_OK) {
        updateDisplay("MATCH FOUND", "Finger ID: " + String(finger.fingerID), "Sending...");
        sendAttendanceLog(String(finger.fingerID), "fingerprint");
        return;
      } else {
        updateDisplay("NO MATCH", "Fingerprint unknown.", "Try again.");
        delay(1500);
        drawIdleScreen();
        return;
      }
    }
  }

  // Check RFID
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String rfidUid = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      if (mfrc522.uid.uidByte[i] < 0x10) rfidUid += "0";
      rfidUid += String(mfrc522.uid.uidByte[i], HEX);
    }
    rfidUid.toUpperCase();
    
    updateDisplay("MATCH FOUND", "RFID: " + rfidUid, "Sending...");
    sendAttendanceLog(rfidUid, "rfid");
    
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
  }
}

void enrollRfid() {
  updateDisplay("ENROLL RFID", "TAP CARD NOW", "Hold near reader");
  reportProgress("ENROLL RFID: Please tap card on RFID reader now...");

  SPI.begin();
  mfrc522.PCD_Init();
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);
  delay(100);

  while (true) {
    if (millis() - lastPollTime > pollInterval) {
      pollServerCommand();
      lastPollTime = millis();
    }
    if (currentMode != "enroll" || enrollType != "rfid") return;

    if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
      break;
    }
    animateWait("ENROLL RFID", "TAP CARD NOW", "Hold near reader");
    delay(50);
  }
  
  String rfidUid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) rfidUid += "0";
    rfidUid += String(mfrc522.uid.uidByte[i], HEX);
  }
  rfidUid.toUpperCase();
  
  updateDisplay("ENROLL SUCCESS", "RFID: " + rfidUid, "Saving to server...");
  reportProgress("RFID Scanned! Registering...");
  sendEnrollSuccess(rfidUid, "rfid");
  
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  delay(2000);
  currentMode = "attendance";
  drawIdleScreen();
}

void enrollFingerprint(int id) {
  updateDisplay("ENROLLING ID: " + String(id), "1. PLACE FINGER", "Touch sensor");
  reportProgress("STEP 1/2: Place finger on scanner now...");

  int p = -1;
  while (p != FINGERPRINT_OK) {
    if (millis() - lastPollTime > pollInterval) {
      pollServerCommand();
      lastPollTime = millis();
    }
    if (currentMode != "enroll") return;
    p = finger.getImage();
    if (p == FINGERPRINT_OK) break;
    animateWait("ENROLLING ID: " + String(id), "1. PLACE FINGER", "Touch sensor");
    delay(50);
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) { 
    updateDisplay("ENROLL ERROR", "Bad scan image.", "Try again...");
    reportProgress("Scan Error: Could not read image properly. Please try again.");
    delay(1500);
    return; 
  }
  
  updateDisplay("ENROLLING ID: " + String(id), "2. LIFT FINGER", "Remove finger now");
  reportProgress("Step 1/2 Complete! Please LIFT your finger now.");
  delay(500);
  p = 0;
  while (p != FINGERPRINT_NOFINGER) {
    if (millis() - lastPollTime > pollInterval) {
      pollServerCommand();
      lastPollTime = millis();
    }
    if (currentMode != "enroll") return;
    p = finger.getImage();
    animateWait("ENROLLING ID: " + String(id), "2. LIFT FINGER", "Remove finger now");
    delay(50);
  }

  updateDisplay("ENROLLING ID: " + String(id), "3. PLACE AGAIN", "Same finger");
  reportProgress("STEP 2/2: Place the SAME finger on scanner again...");
  p = -1;
  while (p != FINGERPRINT_OK) {
    if (millis() - lastPollTime > pollInterval) {
      pollServerCommand();
      lastPollTime = millis();
    }
    if (currentMode != "enroll") return;
    p = finger.getImage();
    if (p == FINGERPRINT_OK) break;
    animateWait("ENROLLING ID: " + String(id), "3. PLACE AGAIN", "Same finger");
    delay(50);
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) { 
    updateDisplay("ENROLL ERROR", "Did not match 2nd scan", "Try again...");
    reportProgress("Scan Error: Second scan image error.");
    delay(1500);
    return; 
  }
  
  reportProgress("Both scans successful! Saving model...");
  p = finger.createModel();
  if (p == FINGERPRINT_OK) {
    p = finger.storeModel(id);
    if (p == FINGERPRINT_OK) {
      updateDisplay("ENROLL SUCCESS", "ID " + String(id) + " Saved!", "Saving to server...");
      reportProgress("Fingerprint ID " + String(id) + " saved!");
      sendEnrollSuccess(String(id), "fingerprint");
    } else {
      updateDisplay("ENROLL ERROR", "Failed to store ID", "Try again.");
      reportProgress("Error: Sensor memory storage failed.");
      delay(1500);
    }
  } else {
    updateDisplay("ENROLL ERROR", "Prints didn't match", "Place finger better");
    reportProgress("Error: Scans did not match. Please try again.");
    delay(1500);
  }
  delay(2000);
  currentMode = "attendance";
  drawIdleScreen();
}

void deleteFingerprint(int id) {
  uint8_t p = finger.deleteModel(id);
  if (p == FINGERPRINT_OK) {
    currentMode = "attendance";
    updateDisplay("DELETE SUCCESS", "User ID " + String(id) + " deleted.", "");
    delay(1500);
    drawIdleScreen();
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Wire.begin(2, 5);
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  }
  display.clearDisplay();
  display.display();
  
  updateDisplay("SAAS HARDWARE", "Connecting WiFi...", ssid);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  
  updateDisplay("SAAS HARDWARE", "WiFi Connected!", "IP: " + WiFi.localIP().toString());
  delay(1500);

  updateDisplay("SAAS HARDWARE", "Checking", "RFID Sensor...");
  SPI.begin();
  mfrc522.PCD_Init();
  mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_max);
  delay(500);

  updateDisplay("SAAS HARDWARE", "Checking", "Fingerprint...");
  bool fpFound = false;
  finger.begin(57600);
  if (finger.verifyPassword()) fpFound = true;
  else {
    finger.begin(9600);
    if (finger.verifyPassword()) fpFound = true;
  }
  if (fpFound) updateDisplay("SAAS HARDWARE", "Fingerprint OK!", "API Active");
  else updateDisplay("WARNING", "Fingerprint Fail", "Check Sensor Wires");
  delay(1500);

  drawIdleScreen();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    updateDisplay("OFFLINE", "WiFi Disconnected", "Reconnecting...");
    delay(1000);
    return;
  }

  if (millis() - lastPollTime > pollInterval) {
    pollServerCommand();
    lastPollTime = millis();
  }

  if (!serverOnline) {
    updateDisplay("OFFLINE", "Server Unreachable", "Retrying API...");
    delay(1000);
    return;
  }

  if (currentMode == "attendance") {
    checkAttendance();
    static unsigned long lastIdleAnim = 0;
    if (millis() - lastIdleAnim > 30) { // Extremely fast 30ms refresh rate for 30+ FPS!
      drawIdleScreen();
      lastIdleAnim = millis();
    }
  } else if (currentMode == "enroll") {
    if (enrollType == "rfid") enrollRfid();
    else enrollFingerprint(targetId);
  } else if (currentMode == "delete") {
    deleteFingerprint(targetId);
  }
  
  delay(10);
}
